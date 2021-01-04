class RunPlugin{
  constructor(options) {
    this.options = options;
  }
  apply(compiler) {
    compiler.hooks.run.tap('RunPlugin', () => {
      console.log('run....')
    })
  }
}

module.exports = RunPlugin;