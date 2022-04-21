#
# Builds and uploads docker images to GitHub container registry for a new release using the latest commit from the master branch.
#

personalAccessToken=$1
if [ -z "${personalAccessToken}" ]; then
	echo "Missing GitHub personal access token! See https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry if you need to create one."
	exit 1
fi

tag=$2
if [ -z "${tag}" ]; then
	echo "Missing version tag!"
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

echo "About to build and push: $tag"
if ! confirm; then
	echo "Aborted by user."
	exit 2
fi

# Build and push docker image
docker buildx build \
	--platform linux/amd64,linux/arm64/v8,linux/arm/v7 \
	--tag ghcr.io/tychothetaco/twitch-drops-bot:"$tag" \
	--tag ghcr.io/tychothetaco/twitch-drops-bot:latest-release \
	--build-arg GIT_COMMIT_HASH="$hash" \
	--output type=registry \
	.
