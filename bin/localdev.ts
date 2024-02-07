import { program } from 'commander';
import { StartLocaldevOptions } from '../types/options.js';
import { startLocaldev } from '../utils/start.js';

await program
	.name('localdev')
	.description('An interactive TUI for local development')
	.option(
		'-p, --port <number>',
		'specify a port for the localdev proxy to listen to',
	)
	.option('--project <path>', 'a path to your project folder')
	.option('--config <path>', 'a path to the localdev configuration file')
	.option(
		'--local-config <path>',
		'a path to the localdev local configuration file',
	)
	.option('--force', 'kill process on port if exists')
	.option('--proxy-only', 'only run the proxy and no services', false)
	.action(
		async (options: StartLocaldevOptions) => {
			startLocaldev(options);
		},
	)
	.parseAsync();

process.on('uncaughtException', (error) => {
	console.error(error);
});

process.on('unhandledRejection', (error) => {
	console.error(error);
});
