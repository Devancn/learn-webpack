const path = require("path");
const DonePlugin = require("./plugins/done-plugin");
const RunPlugin = require("./plugins/run-plugin");
module.exports = {
  mode: "production",
  context: process.cwd(),
  entry: {
    page1: "./src/page1.js",
    page2: "./src/page2.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  resolve: {
    extensions: ["", ".js", ".jsx", ".json"],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [
          path.resolve(__dirname, "loaders", "logger1-loader.js"),
          path.resolve(__dirname, "loaders", "logger2-loader.js"),
        ],
      },
    ],
  },
  plugins: [new RunPlugin(), new DonePlugin()],
};
