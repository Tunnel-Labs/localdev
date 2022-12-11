import { program } from 'commander'

import { renderLocaldevServer } from '~/utils/server/ui.jsx'

await program
	.name('localdev')
	.description('The dev service that powers local Dialect development.')
	.option('-t, --test', 'run the dev script in test mode')
	.action(async (options: { test: boolean }) =>
		renderLocaldevServer({ mode: options.test ? 'test' : 'development' })
	)
	.parseAsync()

process.on('uncaughtException', (error) => {
	console.error(error)
})

process.on('unhandledRejection', (error) => {
	console.error(error)
})
