// eslint-disable-next-line import/no-anonymous-default-export
export default {
	logServerEvents: true,
	servicesToLog: {
		counter1: true,
		counter2: true,
		counter3: true,
	},
	services: {
		counter1: {
			startAutomatically: true,
			command: {
				string: `
					awk 'BEGIN {
						system("sleep 1")
						for (i=1; ; i++) {
							print i; system("sleep 0.05")
						}
					}'
				`,
			},
		},
		counter2: {
			startAutomatically: true,
			command: {
				string: `
					awk 'BEGIN {
						system("sleep 1")
						for (i=1000; ; i++) {
							print i; system("sleep 1")
						}
					}'
				`,
			},
		},
		counter3: {
			startAutomatically: true,
			command: {
				string: `
					awk 'BEGIN {
						system("sleep 1")
						for (i=1000000; ; i++) {
							print i; system("sleep 5")
						}
					}'
				`,
			},
		},
	},
}
