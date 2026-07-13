# @author xiaopeng.fxp
# @date 2026-07-13
.PHONY: test build package alfredworkflow verify

test:
	npm test

build:
	node scripts/build.mjs

package: build
	node scripts/package.mjs

alfredworkflow: package

verify: build
	node scripts/verify.mjs
