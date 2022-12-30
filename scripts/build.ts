import { copyPackageFiles, rmDist, tsc } from 'lionconfig'

rmDist()
await tsc()
await copyPackageFiles()
