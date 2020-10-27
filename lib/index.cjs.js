'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var ts = _interopDefault(require('typescript'));
var path = _interopDefault(require('path'));
var fs = _interopDefault(require('fs'));

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

var getInnerRequest = function getInnerRequest(resolver, request) {
	if (
		typeof request.__innerRequest === "string" &&
		request.__innerRequest_request === request.request &&
		request.__innerRequest_relativePath === request.relativePath
	)
		return request.__innerRequest;
	let innerRequest;
	if (request.request) {
		innerRequest = request.request;
		if (/^\.\.?\//.test(innerRequest) && request.relativePath) {
			innerRequest = resolver.join(request.relativePath, innerRequest);
		}
	} else {
		innerRequest = request.relativePath;
	}
	request.__innerRequest_request = request.request;
	request.__innerRequest_relativePath = request.relativePath;
	return (request.__innerRequest = innerRequest);
};

var TsPathsResolvePlugin = (function () {
    function TsPathsResolvePlugin(_a) {
        var _b = _a === void 0 ? {} : _a, _c = _b.tsConfigPath, tsConfigPath = _c === void 0 ? process.env["TS_NODE_PROJECT"] || ts.findConfigFile(".", ts.sys.fileExists) || "tsconfig.json" : _c, _d = _b.logLevel, logLevel = _d === void 0 ? "warn" : _d;
        this.pluginName = "TsPathsResolvePlugin";
        this.tsConfigPath = tsConfigPath;
        this.logLevel = logLevel;
        this.compilerOptions = this.getTsConfig(this.tsConfigPath, this.logLevel);
        this.mappings = this.createMappings(this.compilerOptions, this.logLevel);
    }
    TsPathsResolvePlugin.prototype.formatLog = function (level, value) {
        switch (level) {
            case "error":
                return "\u001B[1;31m(!) [" + this.pluginName + "]: " + value + "\u001B[0m";
            case "warn":
                return "\u001B[1;33m(!) [" + this.pluginName + "]: " + value + "\u001B[0m";
            default:
                return "\u001B[1;34m(!) [" + this.pluginName + "]: " + value + "\u001B[0m";
        }
    };
    TsPathsResolvePlugin.prototype.getTsConfig = function (tsConfigPath, logLevel) {
        var _a = ts.readConfigFile(tsConfigPath, ts.sys.readFile), error = _a.error, config = _a.config;
        if (error) {
            throw new Error(this.formatLog("error", error.messageText));
        }
        var _b = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(tsConfigPath)), errors = _b.errors, compilerOptions = _b.options;
        if (errors.length > 0) {
            throw new Error(this.formatLog("error", errors.map(function (err) { return err.messageText.toString(); }).join("\n")));
        }
        if (!compilerOptions) {
            throw new Error(this.formatLog("error", "'compilerOptions' is gone."));
        }
        if (!compilerOptions.baseUrl) {
            throw new Error(this.formatLog("error", "Option 'compilerOptions.paths' cannot be used without specifying 'compilerOptions.baseUrl' option."));
        }
        if (!compilerOptions.paths || Object.keys(compilerOptions.paths).length === 0) {
            compilerOptions.paths = {};
            logLevel != "none" && console.warn(this.formatLog("warn", "typescript compilerOptions.paths are empty."));
        }
        return compilerOptions;
    };
    TsPathsResolvePlugin.prototype.createMappings = function (compilerOptions, logLevel) {
        var _this = this;
        var countWildcard = function (value) { var _a; return (_a = value.match(/\*/g)) === null || _a === void 0 ? void 0 : _a.length; };
        var valid = function (value) { return /(\*|\/\*|\/\*\/)/.test(value); };
        var mappings = [];
        for (var _i = 0, _a = Object.keys(compilerOptions.paths); _i < _a.length; _i++) {
            var pattern = _a[_i];
            if (countWildcard(pattern) > 1) {
                logLevel != "none" &&
                    console.warn(this.formatLog("warn", "path pattern '" + pattern + "' can have at most one '*' character."));
                continue;
            }
            var wildcard = pattern.indexOf("*");
            if (wildcard !== -1 && !valid(pattern)) {
                logLevel != "none" && console.warn(this.formatLog("warn", "path pattern '" + pattern + "' is not valid."));
                continue;
            }
            var targets = compilerOptions.paths[pattern].filter(function (target) {
                var wildcard = target.indexOf("*");
                if (wildcard !== -1 && !valid(target)) {
                    logLevel != "none" &&
                        console.warn(_this.formatLog("warn", "target pattern '" + target + "' is not valid"));
                    return false;
                }
                if (target.indexOf("@types") !== -1 || target.endsWith(".d.ts")) {
                    logLevel != "none" && console.warn(_this.formatLog("warn", "type defined " + target + " is ignored."));
                    return false;
                }
                return true;
            });
            if (targets.length == 0) {
                continue;
            }
            if (pattern === "*") {
                mappings.push({ alias: { wildcard: true, pattern: pattern, prefix: "", suffix: "" }, targets: targets });
                continue;
            }
            mappings.push({
                alias: {
                    wildcard: wildcard !== -1,
                    pattern: pattern,
                    prefix: pattern.substr(0, wildcard),
                    suffix: pattern.substr(wildcard + 1),
                },
                targets: targets,
            });
        }
        if (logLevel === "debug") {
            for (var _b = 0, mappings_1 = mappings; _b < mappings_1.length; _b++) {
                var mapping = mappings_1[_b];
                console.log(this.formatLog("info", "pattern: '" + mapping.alias.pattern + "' targets: '" + mapping.targets + "'"));
            }
        }
        return mappings;
    };
    TsPathsResolvePlugin.prototype.findResolve = function (_a) {
        var compilerOptions = _a.compilerOptions, mappings = _a.mappings, request = _a.request, importer = _a.importer;
        var longestMatchedPrefixLength = 0;
        var matched = undefined;
        for (var _i = 0, mappings_2 = mappings; _i < mappings_2.length; _i++) {
            var mapping = mappings_2[_i];
            var _b = mapping.alias, wildcard = _b.wildcard, prefix = _b.prefix, suffix = _b.suffix, source = _b.pattern;
            if (wildcard &&
                request.length >= prefix.length + suffix.length &&
                request.startsWith(prefix) &&
                request.endsWith(suffix)) {
                if (longestMatchedPrefixLength < prefix.length) {
                    longestMatchedPrefixLength = prefix.length;
                    matched = mapping;
                }
            }
            else if (request === source) {
                matched = mapping;
                break;
            }
        }
        if (!matched) {
            return "";
        }
        var matchedWildcard = request.substr(matched.alias.prefix.length, request.length - matched.alias.suffix.length);
        for (var _c = 0, _d = matched.targets; _c < _d.length; _c++) {
            var target = _d[_c];
            var predicted = target;
            if (matched.alias.wildcard) {
                predicted = target.replace("*", matchedWildcard);
            }
            var answer = path.resolve(this.compilerOptions.baseUrl, predicted);
            if (answer.indexOf("node_modules/") !== -1) {
                return answer;
            }
            var result = ts.resolveModuleName(answer, importer, compilerOptions, ts.sys);
            if (result === null || result === void 0 ? void 0 : result.resolvedModule) {
                return result.resolvedModule.resolvedFileName;
            }
            if (fs.existsSync(answer)) {
                return answer;
            }
        }
        return "";
    };
    TsPathsResolvePlugin.prototype.apply = function (resolver) {
        var _this = this;
        resolver.hooks.describedResolve.tapAsync(this.pluginName, function (request, context, callback) {
            var innerRequest = getInnerRequest(resolver, request);
            if (!innerRequest || !request.module) {
                return callback();
            }
            var importer = request.context.issuer;
            if (!importer) {
                return callback();
            }
            var resolved = _this.findResolve({
                compilerOptions: _this.compilerOptions,
                mappings: _this.mappings,
                request: innerRequest,
                importer: importer,
            });
            if (resolved) {
                if (_this.logLevel === "debug") {
                    console.log(_this.formatLog("info", innerRequest + " -> " + resolved));
                }
                return resolver.doResolve(resolver.hooks.resolve, __assign(__assign({}, request), { request: resolved }), null, context, callback);
            }
            return callback();
        });
    };
    return TsPathsResolvePlugin;
}());
module.exports = TsPathsResolvePlugin;

exports.TsPathsResolvePlugin = TsPathsResolvePlugin;
exports.default = TsPathsResolvePlugin;
//# sourceMappingURL=index.cjs.js.map
