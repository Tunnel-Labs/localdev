// eslint-disable-next-line import/no-anonymous-default-export
export default {
	logServerEvents: true,
	servicesToLog: {
		counter: true,
	},
	services: {
		counter: {
			startAutomatically: true,
			command: {
				string: `
					awk 'BEGIN {
						for (i=1; ; i++) {
							print i; system("sleep 0.05")
						}
					}'
				`,
			},
		},
	},
}
