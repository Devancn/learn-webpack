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
    this.entries = [];
    this.assets = {};
    this.files = [];
    this.hooks = {
      run: new SyncHook(),
      done: new SyncHook(),
    };
  }
  run() {
    this.hooks.run.call();
    let entry = {};
    if (typeof this.options.entry === "string") {
      entry.main = this.options.entry;
    } else {
      entry = this.options.entry;
    }

    for (let entryName in entry) {
      let entryFilePath = toUnixPath(
        path.join(this.options.context, entry[entryName])
      );
      let entryModule = this.buildModule(entryName, entryFilePath);
      let chunk = {
        name: entryName,
        entryModule,
        modules: this.modules.filter((module) => module.name === entryName),
      };
      this.chunks.push(chunk);
    }

    // this.modules.push(entryModule);

    this.chunks.forEach((chunk) => {
      let filename = this.options.output.filename.replace("[name]", chunk.name);
      this.assets[filename] = getSource(chunk);
    });

    this.files = Object.keys(this.assets);

    for (let file in this.assets) {
      let targetPath = path.join(this.options.output.path, file);
      fs.writeFileSync(targetPath, this.assets[file]);
    }
    this.hooks.done.call();
  }
  buildModule = (name, modulePath) => {
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
    let module = { id: moduleId, dependencies: [], name };
    let astTree = parser.parse(targetSourceCode, { sourceType: "module" });

    traverse(astTree, {
      CallExpression: ({ node }) => {
        console.log(node, "node");
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
      let dependencyModule = this.buildModule(name, dependency);
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
