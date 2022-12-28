const { createESLintConfig } = require('lionconfig/eslint')

module.exports = createESLintConfig(__dirname, {
	rules: {
		'vue/prefer-import-from-vue': 'off',
	},
})
