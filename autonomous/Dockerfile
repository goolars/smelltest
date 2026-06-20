# Isolated environment for the unattended agent. Its actions cannot touch anything outside
# this container — which is the precondition for running it without surveillance.
FROM node:20-slim

# git is required for the evidence/diff checks.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /work
# Bring smelltest (kernel + autonomous harness). Mount your target project at /work/project.
COPY .. /opt/smelltest
RUN cd /opt/smelltest/autonomous && npm install --omit=dev

# Caps are also enforced here as defaults; override at run time.
ENV SMELLTEST_MAX_USD=2 \
    SMELLTEST_MAX_TURNS=40 \
    SMELLTEST_MAX_REVISIONS=3 \
    SMELLTEST_DEADLINE_MS=600000 \
    SMELLTEST_PERMISSION_MODE=dontAsk \
    SMELLTEST_ATTENDED=0

# ANTHROPIC_API_KEY must be passed at run time (never baked into the image).
# Example:
#   docker run --rm -e ANTHROPIC_API_KEY -e SMELLTEST_VERIFY_CMD="npm test" \
#     -v "$PWD/project:/work/project" smelltest-autonomous \
#     node /opt/smelltest/autonomous/agent.mjs "implement X in /work/project"
ENTRYPOINT ["node", "/opt/smelltest/autonomous/agent.mjs"]
