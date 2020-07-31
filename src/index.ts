import type { ResolvePlugin } from "webpack"
import type { Hook } from "tapable"
import type { CompilerHost, CompilerOptions } from "typescript"
import {
	ModuleResolutionKind,
	sys,
	findConfigFile,
	readConfigFile,
	resolveModuleName,
	createCompilerHost,
} from "typescript"
import path from "path"
import fs from "fs"

interface Hooks {
	describedResolve: Hook
}

interface Request {
	request: string
	module: boolean
	directory: false
	file: boolean
	descriptionFilePath: string
	descriptionFileData: unknown
	relativePath: string
	context: {
		issuer: string
	}
}

interface ResolveContext {
	log: unknown
	stack: Set<string>
	missing: unknown
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
	alias: {
		source: string
		wildcard: boolean
		pattern: RegExp
	}
	targets: string[]
}

interface TsPathsResolvePluginOpitons {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
}

export class TsPathsResolvePlugin implements ResolvePlugin {
	pluginName: string
	configFilePath: string
	compilerOptions: CompilerOptions
	baseUrl: string
	mappings: Mapping[]
	logLevel: "warn" | "debug" | "none"
	host: CompilerHost
	constructor({
		tsConfigPath = process.env["TS_NODE_PROJECT"] || findConfigFile(".", sys.fileExists) || "tsconfig.json",
		logLevel = "warn",
	}: Partial<TsPathsResolvePluginOpitons> = {}) {
		this.pluginName = "ts-paths-resolve-plugin"
		this.configFilePath = tsConfigPath
		this.logLevel = logLevel
		const { compilerOptions } = this.getTsConfig()
		this.compilerOptions = compilerOptions
		this.baseUrl = path.resolve(path.dirname(this.configFilePath), compilerOptions.baseUrl)
		this.mappings = this.createMappings()
		this.host = createCompilerHost(this.compilerOptions)
	}

	apply(resolver: Resolver) {
		resolver.hooks.describedResolve.tapAsync(this.pluginName, this.resolveTsPaths(resolver))
	}

	private getTsConfig(): { compilerOptions: CompilerOptions } {
		const { config, error } = readConfigFile(this.configFilePath, sys.readFile)
		if (error) {
			throw new Error(error.messageText.toString())
		}
		let { compilerOptions } = config
		compilerOptions = compilerOptions || {}
		compilerOptions.baseUrl = compilerOptions.baseUrl || "."
		switch (String.prototype.toLocaleLowerCase.call(compilerOptions.moduleResolution)) {
			case "classic":
				compilerOptions.moduleResolution = ModuleResolutionKind.Classic
				break
			default:
				compilerOptions.moduleResolution = ModuleResolutionKind.NodeJs
				break
		}
		return { compilerOptions }
	}

	private createMappings(): Mapping[] {
		const escapeRegExp = (value: string) => value.replace(/[-\/\\^$*+?\.()[\]{}]/g, "\\$&")
		const mappings: Mapping[] = []
		const paths = this.compilerOptions.paths || {}

		if (this.logLevel != "none" && Object.keys(paths).length === 0) {
			console.log(`\x1b[1;33m(!) [${this.pluginName}]: typescript path alias are empty.\x1b[0m`)
		}

		for (const alias of Object.keys(paths)) {
			const wildcard = alias.indexOf("*") !== -1
			const targets = paths[alias].filter(target => {
				if (target.indexOf("@types") !== -1 || target.endsWith(".d.ts")) {
					if (this.logLevel === "debug") {
						console.log(`\x1b[1;33m(!) [${this.pluginName}]: type defined ${target} is ignored.\x1b[0m`)
					}
					return false
				}
				return true
			})
			if (alias === "*") {
				mappings.push({ alias: { source: alias, wildcard, pattern: /(.*)/ }, targets })
				continue
			}
			const excapedAlias = escapeRegExp(alias)
			const pattern = wildcard
				? new RegExp(`^${excapedAlias.replace("\\*", "(.*)")}`)
				: new RegExp(`^${excapedAlias}$`)
			mappings.push({ alias: { source: alias, wildcard, pattern }, targets })
		}

		if (this.logLevel === "debug") {
			for (const mapping of mappings) {
				console.log(
					`\x1b[36m[${this.pluginName}]\x1b[0m`,
					"pattern:",
					mapping.alias.pattern,
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
		baseUrl,
	}: {
		mapping: Mapping
		source: string
		importer: string
		baseUrl: string
	}) {
		let match = source.match(mapping.alias.pattern)
		if (!match) {
			return ""
		}

		for (const target of mapping.targets) {
			let predicted = target
			if (mapping.alias.wildcard) {
				predicted = target.replace("*", match[1])
			}
			const answer = path.resolve(baseUrl, predicted)
			if (answer.indexOf("node_modules/") != -1) {
				return answer
			}
			const result = resolveModuleName(answer, importer, this.compilerOptions, this.host)
			if (result?.resolvedModule) {
				return result.resolvedModule.resolvedFileName
			}
			if (fs.existsSync(answer)) {
				return answer
			}
		}
		return ""
	}

	private resolveTsPaths(resolver: Resolver) {
		return (request: Request, context: ResolveContext, callback: Function) => {
			if (request == null || !request.module) {
				return callback()
			}

			const importer = request.context.issuer
			if (!importer) {
				return callback()
			}

			const source = request.request
			for (const mapping of this.mappings) {
				const resolved = this.findMapping({
					mapping,
					source,
					importer,
					baseUrl: this.baseUrl,
				})
				if (resolved) {
					if (this.logLevel === "debug") {
						console.log(`\x1b[36m[${this.pluginName}]\x1b[0m`, source, "->", resolved)
					}
					return resolver.doResolve(
						resolver.ensureHook("resolve"),
						{ ...request, request: resolved },
						"aliased with mapping '" + source + "': '" + mapping.alias.source + "' to '" + resolved + "'",
						context,
						callback,
					)
				}
			}
			return callback()
		}
	}
}

export default TsPathsResolvePlugin
