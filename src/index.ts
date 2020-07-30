// Fork from https://github.com/s-panferov/awesome-typescript-loader/blob/master/src/paths-plugin.ts

import type { ResolvePlugin } from "webpack"
import type { Hook } from "tapable"
import type { CompilerOptions } from "typescript"
import getInnerRequest from "enhanced-resolve/lib/getInnerRequest"
import { findConfigFile, sys, nodeModuleNameResolver } from "typescript"
import path from "path"
import fs from "fs"
import json5 from "json5"

interface Hooks {
	describedResolve: Hook
}

interface Request {
	request?: Request | string
	relativePath: string
	context: {
		issuer: string
	}
}

interface ResolveContext {
	log: any
	stack: Set<string>
	missing: any
}

interface Resolver {
	hooks: Hooks
	doResolve(
		hook: Hook,
		request: Request,
		description: string,
		resolveContext: ResolveContext,
		Callback: Function,
	): void
	ensureHook(name: string): Hook
	join(relativePath: string, innerRequest: Request): Request
}

interface Mapping {
	wildcard: boolean
	alias: string
	pattern: RegExp
	targets: string[]
}

interface TsPathsResolvePluginOpitons {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
}

export default TsPathsResolvePlugin

export class TsPathsResolvePlugin implements ResolvePlugin {
	pluginName: string
	configFilePath: string
	compilerOptions: CompilerOptions
	absoluteBaseUrl: string
	mappings: Mapping[]
	logLevel: "warn" | "debug" | "none"
	constructor({
		tsConfigPath = process.env["TS_NODE_PROJECT"] || findConfigFile(".", sys.fileExists) || "tsconfig.json",
		logLevel = "warn",
	}: Partial<TsPathsResolvePluginOpitons> = {}) {
		this.pluginName = "ts-paths-resolve-plugin"
		this.configFilePath = tsConfigPath
		this.logLevel = logLevel
		this.mappings = this.createMappings()
	}

	apply(resolver: Resolver) {
		resolver.hooks.describedResolve.tapAsync(this.pluginName, this.resolveTsPaths(resolver))
	}

	private getTsConfig(): { compilerOptions: CompilerOptions } {
		const configJson = sys.readFile(this.configFilePath)
		if (!configJson) {
			throw Error(`config is not found: ${this.configFilePath}`)
		}
		return json5.parse(configJson)
	}

	private createMappings(): Mapping[] {
		const escapeRegExp = (value: string) => value.replace(/[-\/\\^$*+?\.()[\]{}]/g, "\\$&")
		const mappings: Mapping[] = []
		const { compilerOptions } = this.getTsConfig()
		this.absoluteBaseUrl = path.resolve(path.dirname(this.configFilePath), compilerOptions?.baseUrl || ".")
		this.compilerOptions = compilerOptions
		const paths = compilerOptions.paths || {}

		if (this.logLevel != "none") {
			if (Object.keys(paths).length === 0) {
				console.log(`\x1b[1;33m(!) [${this.pluginName}]: typescript path alias are empty.\x1b[0m`)
			}
		}

		for (const alias of Object.keys(paths)) {
			if (alias === "*") {
				if (this.logLevel != "none") {
					console.log(`\x1b[1;33m(!) [${this.pluginName}]: alias "*" is not accepted.\x1b[0m`)
				}
				continue
			}
			const wildcard = alias.indexOf("*") !== -1
			const excapedAlias = escapeRegExp(alias)
			const targets = paths[alias].filter(target => {
				if (target.startsWith("@types") || target.endsWith(".d.ts")) {
					if (this.logLevel != "none") {
						console.log(`\x1b[1;33m(!) [${this.pluginName}]: type defined ${target} is ignored.\x1b[0m`)
					}
					return false
				}
				return true
			})
			const pattern = wildcard
				? new RegExp(`^${excapedAlias.replace("\\*", "(.*)")}`)
				: new RegExp(`^${excapedAlias}$`)
			mappings.push({ wildcard, alias, pattern, targets })
		}
		if (this.logLevel == "debug") {
			for (const mapping of mappings) {
				console.log(
					`\x1b[36m[${this.pluginName}]\x1b[0m`,
					"pattern:",
					mapping.pattern,
					"targets:",
					mapping.targets,
				)
			}
		}
		return mappings
	}

	private findMapping({
		mapping,
		source,
		importer,
		compilerOptions,
		baseUrl = ".",
	}: {
		mapping: Mapping
		source: string
		importer: string
		compilerOptions: CompilerOptions
		baseUrl: string
	}) {
		let match = source.match(mapping.pattern)
		if (!match) {
			return ""
		}
		for (const target of mapping.targets) {
			const newPath = mapping.wildcard ? target.replace("*", match[1]) : target
			const answer = path.resolve(baseUrl, newPath)
			const { resolvedModule } = nodeModuleNameResolver(answer, importer, compilerOptions, sys)
			if (resolvedModule) {
				return resolvedModule.resolvedFileName
			}
			if (fs.existsSync(answer)) {
				return answer
			}
		}
		return ""
	}

	private resolveTsPaths(resolver: Resolver) {
		return (request: Request, context: ResolveContext, callback: Function) => {
			const innerRequest: string = getInnerRequest(resolver, request)
			if (!innerRequest || this.mappings.length == 0) {
				return callback()
			}

			const hook = resolver.ensureHook("resolve")
			console.log(context)
			for (const mapping of this.mappings) {
				const resolved = this.findMapping({
					mapping,
					source: innerRequest,
					importer: request.context.issuer,
					compilerOptions: this.compilerOptions,
					baseUrl: this.absoluteBaseUrl,
				})
				if (resolved) {
					if (this.logLevel == "debug") {
						console.log(`\x1b[36m[${this.pluginName}]\x1b[0m`, innerRequest, "->", resolved)
					}
					const newRequest = { ...request, request: resolved }
					return resolver.doResolve(
						hook,
						newRequest,
						"aliased with mapping '" + innerRequest + "': '" + mapping.alias + "' to '" + resolved + "'",
						context,
						callback,
					)
				}
			}
			return callback()
		}
	}
}
