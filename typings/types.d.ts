interface TsPathsResolvePluginOpitons {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
}

declare class TsPathsResolvePlugin {
	constructor(options?: Partial<TsPathsResolvePluginOpitons>)
	apply(resolver: unknown): void
}

export = TsPathsResolvePlugin
