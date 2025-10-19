APP_NAME=git-timeline
BUILD_DIR=./bin

install: build
	@echo "Installing $(APP_NAME) to /usr/local/bin..."
	@cp $(BUILD_DIR)/$(APP_NAME) /usr/local/bin/ && rm -rf $(BUILD_DIR)

build:
	@echo "Building $(APP_NAME)..."
	@bun run build:bin
