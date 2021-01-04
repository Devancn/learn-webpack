const path = require("path");
const fs = require("fs");
const { SyncHook } = require("tapable");
const types = require("babel-types");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;

function toUnixPath(filePath) {
  return filePath.replace(/\\/g, path.posix.sep);
}
let baseDir = toUnixPath(process.cwd());
class Compiler {
  constructor(options) {
    this.options = options;
    this.modules = [];
    this.chunks = [];
    this.assets = {};
    this.files = [];
    this.hooks = {
      run: new SyncHook(),
      done: new SyncHook(),
    };
  }
  run() {
    this.hooks.run.call();

    let entry = toUnixPath(path.join(this.options.context, this.options.entry));

    let entryModule = this.buildModule(entry);
    // this.modules.push(entryModule);

    let chunk = { name: "main", entryModule, modules: this.modules };
    this.chunks.push(chunk);
    this.chunks.forEach((chunk) => {
      this.assets[chunk.name + ".js"] = getSource(chunk);
    });

    this.files = Object.keys(this.assets);
    let targetPath = path.join(
      this.options.output.path,
      this.options.output.filename
    );
    for (let file in this.assets) {
      fs.writeFileSync(targetPath, this.assets[file]);
    }
    this.hooks.done.call();
  }
  buildModule = (modulePath) => {
    let targetSourceCode, originalSourceCode;
    targetSourceCode = originalSourceCode = fs.readFileSync(
      modulePath,
      "utf-8"
    );

    let rules = this.options.module.rules;
    let loaders = [];
    for (let i = 0; i < rules.length; i++) {
      if (rules[i].test.test(modulePath)) {
        loaders = [...loaders, ...rules[i].use];
      }
    }

    for (let i = loaders.length - 1; i >= 0; i--) {
      let loader = loaders[i];
      targetSourceCode = require(loader)(targetSourceCode);
    }

    console.log(`originalSourceCode`, originalSourceCode);
    console.log(`targetSourceCode`, targetSourceCode);

    let moduleId = "./" + path.posix.relative(baseDir, modulePath);
    let module = { id: moduleId, dependencies: [] };
    let astTree = parser.parse(targetSourceCode, { sourceType: "module" });

    traverse(astTree, {
      CallExpression: ({ node }) => {
        if (node.callee.name === "require") {
          let moduleName = node.arguments[0].value;
          let dirname = path.posix.dirname(modulePath);
          let depModulePath = path.posix.join(dirname, moduleName);
          let extensions = this.options.resolve.extensions;
          depModulePath = tryExtensions(
            depModulePath,
            extensions,
            moduleName,
            dirname
          );
          let depModuleId = "./" + path.posix.relative(baseDir, depModulePath);
          node.arguments = [types.stringLiteral(depModuleId)];
          module.dependencies.push(depModulePath);
        }
      },
    });

    let { code } = generator(astTree);
    module._source = code;
    module.dependencies.forEach((dependency) => {
      let dependencyModule = this.buildModule(dependency);
      this.modules.push(dependencyModule);
    });
    return module;
  };
}

function getSource(chunk) {
  return `
  (() => {
    var modules = {
      ${chunk.modules
        .map(
          (module) => `
        "${module.id}": (module,exports,require) => {
          ${module._source}
        }`
        )
        .join(",")} 
    }
    var cache = {};
    function require(moduleId) {
      if(cache[moduleId]) {
        return cache[moduleId].exports
      }
      var module = (cache[moduleId]) = {
        exports: {}
      }
      modules[moduleId](module, module.exports, require);
      return module.exports;
    }
    (() => {
      ${chunk.entryModule._source}
    })()
   })()
  `;
}

function tryExtensions(
  modulePath,
  extensions,
  originalModulePath,
  moduleContext
) {
  for (let i = 0; i < extensions.length; i++) {
    const path = modulePath + extensions[i];
    if (fs.existsSync(path)) {
      return path;
    }
  }
  throw new Error(
    `Module not found: Error: Can't resolve ${originalModulePath} in ${moduleContext}`
  );
}

module.exports = Compiler;
