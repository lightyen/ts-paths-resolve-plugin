# ts-paths-resolve-plugin

Make webpack resolve alias with tsconfig paths

```sh
yarn add -D ts-paths-resolve-plugin
```

webpack.config.js

```js

const TsPathsResolvePlugin = require('ts-paths-resolve-plugin');

module.exports = {
  resolve: {
    plugins: [new TsPathsResolvePlugin()]
  }
}
```

Example tsconfig.json

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

## reference

- https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping
