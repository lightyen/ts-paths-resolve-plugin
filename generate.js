import fs from "fs"
export default function generate(options = {}) {
	return {
		name: "generate_esm_packageJson_plugin",
		writeBundle: async () => {
			const content = `{\n  "type":"module"\n}\n`
			console.log("write")
			await fs.writeFile("./dist/esm/package.json", content, err => {
				if (err) {
					console.error(err)
				}
			})
		},
	}
}
