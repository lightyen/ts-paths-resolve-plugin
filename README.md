# ts-paths-resolve-plugin

Make webpack resolve alias with tsconfig paths

```sh
yarn add -D ts-paths-resolve-plugin
```

or

```sh
npm install --save-dev ts-paths-resolve-plugin
```

Use

```js

const TsPathsResolvePlugin = require('ts-paths-resolve-plugin');

module.exports = {
  ...
  resolve: {
    plugins: [new TsPathsResolvePlugin(/** options **/)]
  }
  ...
}
```

Example tsconfig

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
