const { defineConfig } = require('@dialect-inc/eslint-config')

module.exports = defineConfig(__dirname, {
	rules: {
		// We can't use `@dialect-inc/logger` when using ink and instead need to use patched console methods
		'no-console': 'off'
	}
})
