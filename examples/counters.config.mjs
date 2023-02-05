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
					node -e '
						const delay=n=>new Promise(r=>setTimeout(r,n))
						;(async () => {
							await delay(1000)
							for(let i=0;;i++){process.stderr.write(i+"\\n");await delay(50)}
						})()
					'
				`,
			},
		},
		counter2: {
			startAutomatically: true,
			command: {
				string: `
					node -e '
						const delay=n=>new Promise(r=>setTimeout(r,n))
						;(async () => {
							await delay(1000)
							for(let i=0;;i+=100){
								let str = ""
								for (let j=0;j<100;j+=1){
									str += (i + j) + "\\n"
								}
								process.stderr.write(str+"\\n");
								await delay(1000)
							}
						})()
					'
				`,
			},
		},
		counter3: {
			startAutomatically: true,
			command: {
				string: `
					node -e '
						const delay=n=>new Promise(r=>setTimeout(r,n))
						;(async () => {
							await delay(1000)
							for(let i=0;;i++){process.stderr.write(i+"\\n");await delay(5000)}
						})()
					'
				`,
			},
		},
	},
}
