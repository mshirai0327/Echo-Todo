.PHONY: help icons build dev clean

help:
	@printf '%s\n' \
		'make build  - Generate icons and build the extension into dist/' \
		'make dev    - Watch build for local development' \
		'make icons  - Regenerate PNG extension icons' \
		'make clean  - Remove dist/'

icons:
	npm run generate:icons

build:
	npm run build

dev:
	npm run dev

clean:
	rm -rf dist
