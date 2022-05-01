#
# Builds and uploads docker images to GitHub container registry for a new release using the latest commit from the master branch.
#

personalAccessToken=$1
if [ -z "${personalAccessToken}" ]; then
	echo "Missing GitHub personal access token! See https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry if you need to create one."
	exit 1
fi

# Read the current version from package.json
currentVersion=$(cat ../package.json | grep '"version": "' | grep -o '[0-9|\.]\+')
if [ -z "${currentVersion}" ]; then
	echo "Failed to read current version from package.json!"
	exit 1
fi

# Make sure the version code has been updated
response=$(curl -s https://api.github.com/repos/tychothetaco/twitch-drops-bot/releases?per_page=1)
latestVersion=$(echo "$response" | grep '"tag_name": "v\([0-9]\+\.\)\+[0-9]\+"' | grep -o '[0-9|\.]\+')
if [ -z "$latestVersion" ]; then
	echo "Failed to get latest version!"
	echo "$response"
fi
if [ "$latestVersion" = "$currentVersion" ]; then
	echo "Current version matches latest version! Did you forget to update the version number in package.json?"
	exit 1
fi

# Login to GitHub container registry
echo "Logging in to GitHub container registry..."
echo "$personalAccessToken" | docker login ghcr.io -u tychothetaco --password-stdin

# Get the git commit hash of the latest commit on the master branch
hash=$(git log -n 1 master --pretty=format:%H)
echo "Commit hash: $hash"

confirm() {
	read -r -p "Are you sure? [y/N] " response
	case "$response" in
	[yY][eE][sS] | [yY])
		true
		;;
	*)
		false
		;;
	esac
}

echo "About to build and push version $currentVersion"
if ! confirm; then
	echo "Aborted by user."
	exit 2
fi

# Build and push docker image
docker buildx build \
	--platform linux/amd64,linux/arm64/v8,linux/arm/v7 \
	--tag ghcr.io/tychothetaco/twitch-drops-bot:v"$currentVersion" \
	--tag ghcr.io/tychothetaco/twitch-drops-bot:latest-release \
	--build-arg GIT_COMMIT_HASH="$hash" \
	--output type=registry \
	.
