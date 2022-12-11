import fs from 'node:fs'
import path from 'node:path'

import { cli } from '@dialect-inc/cli-helpers'
import tmp from 'tmp-promise'

export async function createMkcertCerts({
	localDomains
}: {
	localDomains: string[]
}) {
	const mkcertCertsDir = await tmp.dir()

	const keyFileName = 'dialect.test-key.pem'
	const certFileName = 'dialect.test-cert.pem'

	await cli.mkcert('-install')
	await cli.mkcert(
		['-key-file', keyFileName, '-cert-file', certFileName, ...localDomains],
		{ cwd: mkcertCertsDir.path }
	)

	const [key, cert] = await Promise.all([
		fs.promises.readFile(path.join(mkcertCertsDir.path, keyFileName), 'utf8'),
		fs.promises.readFile(path.join(mkcertCertsDir.path, certFileName), 'utf8')
	])

	return {
		key,
		cert
	}
}
