// Fork from https://github.com/s-panferov/awesome-typescript-loader/blob/master/src/paths-plugin.ts

import type { ResolvePlugin } from "webpack"
import type { Hook } from "tapable"
import type { CompilerOptions } from "typescript"
import * as getInnerRequest from "enhanced-resolve/lib/getInnerRequest"
import * as path from "path"
import * as fs from "fs"
import * as json5 from "json5"

interface Hooks {
	describedResolve: Hook
}

interface Request {
	request?: Request | string
	relativePath: string
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
	star: boolean
	alias: string
	pattern: RegExp
	target: string
}

const escapeRegExp = (value: string) => value.replace(/[-\/\\^$*+?\.()[\]{}]/g, "\\$&")

interface PluginOptions {
	configFile: string
	logLevel: "warn" | "info" | "debug"
}

/** resolve plugin for tsconfig paths */
class TsPathsResolvePlugin implements ResolvePlugin {
	configFilePath: string
	absoluteBaseUrl: string
	mappings: Mapping[]
	pluginName: string
	logLevel: "warn" | "info" | "debug"
	constructor({
		configFile = process.env["TS_NODE_PROJECT"] || path.resolve(process.cwd(), "tsconfig.json"),
		logLevel = "warn",
	}: Partial<PluginOptions> = {}) {
		this.pluginName = "ts-paths-resolve-plugin"
		this.configFilePath = configFile
		this.mappings = this.createMappings()
		this.logLevel = logLevel
	}

	private createMappings(): Mapping[] {
		let json_str = fs.readFileSync(this.configFilePath, { encoding: "utf-8" })
		const config: { compilerOptions: CompilerOptions } = json5.parse(json_str)
		if (!config) {
			return []
		}
		const { compilerOptions } = config
		if (!compilerOptions) {
			return []
		}
		const { baseUrl } = compilerOptions
		this.absoluteBaseUrl = path.resolve(path.dirname(this.configFilePath), baseUrl || ".")
		const paths = compilerOptions.paths ?? {}
		const mappings: Mapping[] = []
		for (const alias of Object.keys(paths)) {
			const star = alias.indexOf("*") !== -1
			if (alias === "*") {
				console.log(`\x1b[33m[${this.pluginName}]: alias "*" is not valid.\x1b[0m`)
				continue
			}
			const excapedAlias = escapeRegExp(alias)
			const targets = paths[alias]
			for (const target of targets) {
				if (target.indexOf("@types") !== -1 || target.indexOf(".d.ts") !== -1) {
					console.log(`\x1b[33m[${this.pluginName}]: @types or *.d.ts is ignored.\x1b[0m`)
					continue
				}
				const pattern = star
					? new RegExp(`^${excapedAlias.replace("\\*", "(.*)")}`)
					: new RegExp(`^${excapedAlias}$`)
				mappings.push({ star, alias, pattern, target })
			}
		}
		return mappings
	}

	apply(resolver: Resolver) {
		resolver.hooks.describedResolve.tapAsync("ts-paths-resolve-plugin", this.resolveTsPaths(resolver))
	}

	private resolveTsPaths(resolver: Resolver) {
		const len = this.mappings.length
		return (request: Request, context: ResolveContext, callback: Function) => {
			const innerRequest: string = getInnerRequest(resolver, request)
			if (!innerRequest) {
				return callback()
			}

			let m = 0
			let match: RegExpMatchArray
			for (; m < len; m++) {
				match = innerRequest.match(this.mappings[m].pattern)
				if (match) {
					break
				}
			}
			if (this.logLevel === "debug") {
				console.log(`\x1b[36mdebug\x1b[0m`, innerRequest)
			}
			if (m == len) {
				return callback()
			}

			const { pattern, star, target, alias } = this.mappings[m]
			const relative = star ? match[1] : match[0]
			let newRequestPath = target
			if (star) {
				newRequestPath = newRequestPath.replace("*", relative)
			}
			newRequestPath = path.resolve(this.absoluteBaseUrl, newRequestPath)

			if (this.logLevel === "debug" || this.logLevel === "info") {
				console.log(`\x1b[34mmatch\x1b[0m`, innerRequest, pattern, relative)
				console.log(`\x1b[32mresolved\x1b[0m`, newRequestPath)
			}
			const newRequest = { ...request, request: newRequestPath }
			const hook = resolver.ensureHook("resolve")
			return resolver.doResolve(
				hook,
				newRequest,
				"aliased with mapping '" + innerRequest + "': '" + alias + "' to '" + newRequestPath + "'",
				context,
				callback,
			)
		}
	}
}

export = TsPathsResolvePlugin
