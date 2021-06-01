# ts-paths-resolve-plugin

A webpack resolve plugin for resolving tsconfig paths.

```sh
yarn add -D ts-paths-resolve-plugin
```

Configurate in `webpack.config.js`:

```js

const TsPathsResolvePlugin = require('ts-paths-resolve-plugin');

module.exports = {
  resolve: {
    plugins: [new TsPathsResolvePlugin()]
  }
}
```

`tsconfig.json` example:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "node",
    "target": "esnext",
    "lib": ["esnext", "dom", "dom.iterable"],
    "types": ["react", "webpack-env"],
    "baseUrl": ".",
    "paths": {
      "~/*": ["./*"]
    }
  }
}

```

And you can import with alias instead of annoying path

```js
// import App from "../../../../App"
import App from "~/App"

...

```

## Options

### tsConfigPath _(string)_

Specify set where your TypeScript configuration file.

If not set:

- use Environment variable **TS_NODE_PROJECT**
- or search tsconfig.json in current working directory.

### logLevel _("warn" | "debug" | "none") (default: "warn")_

Log level when the plugin is running.

## reference

- https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping
- https://github.com/microsoft/TypeScript/issues/5039
