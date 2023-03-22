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
				string: 'pnpm --filter=@tunnel/website dev',
				cwd: '/Users/leondreamed/projects/Tunnel-Dev/Tunnel',
			},
		},
		'start-docker': {
			startAutomatically: true,
			command: {
				string: 'pnpm --filter=@tunnel/development-scripts docker/start',
				cwd: '/Users/leondreamed/projects/Tunnel-Dev/Tunnel',
			},
			healthCheck: {
				port: 5432,
			},
		},
	},
}
