/** @type {import('../src/types/config.js').LocaldevConfig} */
// eslint-disable-next-line import/no-anonymous-default-export
export default {
	logServerEvents: true,
	servicesToLog: {
		'dialect-website': true,
	},
	services: {
		'dialect-website': {
			startAutomatically: true,
			dependsOn: ['start-docker'],
			healthCheck: {
				port: 3001,
			},
			command: {
				string: 'pnpm --filter=@dialect-inc/dialect-website dev',
				cwd: '/Users/leondreamed/projects/Dialect-Inc/Dialect-Inc',
			},
		},
		'start-docker': {
			startAutomatically: true,
			command: {
				string: 'pnpm --filter=@dialect-inc/development-scripts start-docker',
				cwd: '/Users/leondreamed/projects/Dialect-Inc/Dialect-Inc',
			},
			healthCheck: {
				port: 5432,
			},
		},
	},
}
