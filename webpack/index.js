let Compiler = require('./compiler');

function webpack(options) {
  let shellConfig = process.argv.slice(2).reduce((shellConfig, item) => {
    let [key, value] = item.split("=");
    shellConfig[key.slice(2)] = value;
    return shellConfig;
  }, {});
  Object.assign(options, shellConfig);

  let compiler = new Compiler(options);

  if(options.plugins && Array.isArray(options.plugins)) {
    for(let plugin of options.plugins) {
      plugin.apply(compiler)
    }
  }
  return compiler;
}

module.exports = webpack