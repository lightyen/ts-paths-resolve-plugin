import type { ResolvePlugin } from "webpack"

interface TsPathsResolvePluginOpitons {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
}

declare class TsPathsResolvePlugin implements ResolvePlugin {
	constructor({ tsConfigPath, logLevel }?: Partial<TsPathsResolvePluginOpitons>)
	apply(resolver: any): void
}

export = TsPathsResolvePlugin
