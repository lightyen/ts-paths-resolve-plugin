import type { Hook, AsyncHook } from "tapable"
import ts from "typescript"
import path from "path"
import fs from "fs"
import getInnerRequest from "enhanced-resolve/lib/getInnerRequest"

interface Resolver {
	hooks: Hooks
	getHook: (source: string) => Hook<unknown, unknown>
	doResolve(
		hook: Hook<unknown, unknown>,
		request: Request,
		description: string,
		resolveContext: ResolveContext,
		callback: (err?: Error, result?: unknown) => void,
	): void
	ensureHook(source: string): Hook<unknown, unknown>
	join(relativePath: string, innerRequest: Request): Request
}

interface Hooks {
	describedResolve: AsyncHook<any, unknown>
	resolve: Hook<unknown, unknown>
}

interface Request {
	path: string | false
	request: string
	query: string
	fragment: string
	directory: boolean
	module: boolean
	file: boolean
	descriptionFilePath: string
	descriptionFileRoot: string
	descriptionFileData: unknown
	relativePath: string
	context: {
		issuer: string
	}
}

interface ResolveContext {
	log: (value: string) => void
	stack: Set<string>
	missing: unknown
}

interface Mapping {
	pattern: string
	prefix: string
	suffix: string
	wildcard: boolean
	targets: string[]
}

type LogLevel = "warn" | "debug" | "none"

interface TsPathsResolvePluginOpitons {
	tsConfigPath: string
	logLevel: LogLevel
}

function isPatternMatch(prefix: string, suffix: string, candidate: string) {
	return (
		candidate.length >= prefix.length + suffix.length && candidate.startsWith(prefix) && candidate.endsWith(suffix)
	)
}

function findBestPatternMatch(patterns: Mapping[], candidate: string) {
	let longestMatchedPrefixLength = -1
	let matched: Mapping = undefined
	for (const p of patterns) {
		const { wildcard, prefix, suffix, pattern } = p
		if (wildcard && isPatternMatch(prefix, suffix, candidate)) {
			if (longestMatchedPrefixLength < prefix.length) {
				longestMatchedPrefixLength = prefix.length
				matched = p
			}
		} else if (pattern === candidate) {
			return p
		}
	}
	return matched
}


export class TsPathsResolvePlugin {
	pluginName: string
	tsConfigPath: string
	compilerOptions: ts.CompilerOptions
	mappings: Mapping[]
	logLevel: LogLevel
	constructor({
		tsConfigPath = process.env["TS_NODE_PROJECT"] || ts.findConfigFile(".", ts.sys.fileExists) || "tsconfig.json",
		logLevel = "warn",
	}: Partial<TsPathsResolvePluginOpitons> = {}) {
		this.pluginName = "TsPathsResolvePlugin"
		this.tsConfigPath = tsConfigPath
		this.logLevel = logLevel
		this.compilerOptions = this.getTsConfig(this.tsConfigPath, this.logLevel)
		this.mappings = this.createMappings(this.compilerOptions, this.logLevel)
	}

	private formatLog(level: "error" | "warn" | "info", value: unknown) {
		switch (level) {
			case "error":
				return `\x1b[1;31m(!) [${this.pluginName}]: ${value}\x1b[0m`
			case "warn":
				return `\x1b[1;33m(!) [${this.pluginName}]: ${value}\x1b[0m`
			default:
				return `\x1b[1;34m(!) [${this.pluginName}]: ${value}\x1b[0m`
		}
	}

	private getTsConfig(tsConfigPath: string, logLevel: LogLevel): ts.CompilerOptions {
		const { error, config } = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
		if (error) {
			throw new Error(this.formatLog("error", error.messageText))
		}
		let { errors, options: compilerOptions } = ts.parseJsonConfigFileContent(
			config,
			ts.sys,
			path.dirname(tsConfigPath),
		)
		if (errors.length > 0) {
			throw new Error(this.formatLog("error", errors.map(err => err.messageText.toString()).join("\n")))
		}
		if (!compilerOptions) {
			throw new Error(this.formatLog("error", "'compilerOptions' is not found."))
		}
		if (compilerOptions.baseUrl == undefined) {
			compilerOptions.baseUrl = path.dirname(tsConfigPath)
		}
		if (!compilerOptions.paths || Object.keys(compilerOptions.paths).length === 0) {
			compilerOptions.paths = {}
		}
		return compilerOptions
	}

	private createMappings(compilerOptions: ts.CompilerOptions, logLevel: LogLevel): Mapping[] {
		const mappings: Mapping[] = []
		for (const pattern of Object.keys(compilerOptions.paths)) {
			const indexOfStar = pattern.indexOf("*")
			if (indexOfStar !== -1 && pattern.indexOf("*", indexOfStar + 1) !== -1) {
				logLevel != "none" && console.warn(this.formatLog("warn", `path pattern '${pattern}' is not valid.`))
				continue
			}
			const targets = compilerOptions.paths[pattern].filter(target => {
				const valid = (value: string) => /(\*|\/\*|\/\*\/)/.test(value)
				const wildcard = target.indexOf("*")
				if (wildcard !== -1 && !valid(target)) {
					logLevel != "none" &&
						console.warn(this.formatLog("warn", `target pattern '${target}' is not valid`))
					return false
				}
				if (target.indexOf("@types") !== -1 || target.endsWith(".d.ts")) {
					logLevel != "none" && console.warn(this.formatLog("warn", `type defined ${target} is ignored.`))
					return false
				}
				return true
			})
			if (targets.length == 0) {
				continue
			}
			if (pattern === "*") {
				mappings.push({ wildcard: true, pattern, prefix: "", suffix: "", targets })
				continue
			}
			mappings.push({
				wildcard: indexOfStar !== -1,
				pattern,
				prefix: pattern.substr(0, indexOfStar),
				suffix: pattern.substr(indexOfStar + 1),
				targets,
			})
		}
		if (logLevel === "debug") {
			for (const mapping of mappings) {
				console.log(this.formatLog("info", `pattern: '${mapping.pattern}' targets: '${mapping.targets}'`))
			}
		}
		return mappings
	}

	private findResolve({
		compilerOptions,
		mappings,
		request,
		importer,
	}: {
		compilerOptions: ts.CompilerOptions
		mappings: Mapping[]
		request: string
		importer: string
	}) {
		const matched = findBestPatternMatch(mappings, request)
		if (!matched) {
			return ""
		}
		const matchedWildcard = request.substr(
			matched.prefix.length,
			request.length - matched.suffix.length,
		)
		for (const target of matched.targets) {
			let predicted = target
			if (matched.wildcard) {
				predicted = target.replace("*", matchedWildcard)
			}
			const answer = path.resolve(this.compilerOptions.baseUrl, predicted)
			if (answer.indexOf("node_modules/") !== -1) {
				return answer
			}
			// resolve module path with typescript API
			const result = ts.resolveModuleName(answer, importer, compilerOptions, ts.sys)
			if (result?.resolvedModule) {
				return result.resolvedModule.resolvedFileName
			}
			// for assets module
			if (fs.existsSync(answer)) {
				return answer
			}
		}

		return ""
	}

	apply(resolver: Resolver) {
		resolver.hooks.describedResolve.tapAsync(
			this.pluginName,
			(request: Request, context: ResolveContext, callback: (err?: Error, result?: unknown) => void) => {
				const innerRequest: string = getInnerRequest(resolver, request)
				if (!innerRequest || !request.module) {
					return callback()
				}
				const importer = request.context.issuer
				if (!importer) {
					return callback()
				}
				const resolved = this.findResolve({
					compilerOptions: this.compilerOptions,
					mappings: this.mappings,
					request: innerRequest,
					importer,
				})
				if (resolved) {
					if (this.logLevel === "debug") {
						console.log(this.formatLog("info", `${innerRequest} -> ${resolved}`))
					}
					return resolver.doResolve(
						resolver.hooks.resolve,
						{ ...request, request: resolved },
						null,
						context,
						callback,
					)
				}
				return callback()
			},
		)
	}
}

export default TsPathsResolvePlugin

if (globalThis.module) {
	module.exports = TsPathsResolvePlugin
}
