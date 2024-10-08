#!/usr/bin/env node

const replacer = require('replace-in-file')
const package = require('../../package.json')

const buildDate = new Date().toISOString()
// get git commit hash from GITHUB_SHA environment variable
const commitHash = process.env.GITHUB_SHA || 'unknown'

const options = {
    files: 'src/environments/environment*.ts',
    from: [/%VERSION%/g, /%BUILD_DATE%/g, /%COMMIT_HASH%/g],
    to: [package.version, buildDate, commitHash],
}

try {
    const changes = replacer.sync(options)
    console.log('Modified files:', JSON.stringify(changes, null, 2))
} catch (error) {
    console.error('Error replacing version strings occurred:', error)
}
