# Build without production credentials

Objective: preserve the reviewed Zelo application and existing data while removing production credentials from the EasyPanel Dockerfile build boundary. Build a container from trusted main after CI passes; give the registry token only to the publish step; configure EasyPanel to execute a verified immutable image with its existing runtime environment.

Scope: `.github/workflows/ci.yml` and this operational contract. No changes to application authentication, bank/WhatsApp bindings, stored records or encryption formats. No provider credential generation or revocation by the agent through browser controls.

Verification: existing CI runs `npm ci --ignore-scripts`, secret-pattern and dependency checks, `npx tsc --noEmit`, `npx eslint .`, `npm test` and `npm run build`. The publish job must depend on green checks and run only for a main push. Its Docker build receives no production environment, build arguments or secret mounts. Verify the image starts without secrets and protected endpoints deny unauthenticated requests before publishing.

Deployment: verify server architecture, registry access and image digest before changing the source. Preserve the runtime environment and data volume. Retain the previous image as rollback; do not use a mutable tag as the rollback identity. A source change is complete only after official API headers, existing customer session, bank data and linked WhatsApp status are verified again.

Rotation: the owner generates and saves replacement provider credentials directly. Update and test one integration at a time before retiring the old credential. Do not replace DATA_ENCRYPTION_KEY without a separately tested re-encryption and recovery procedure.

Boundaries: never print credentials, inspect raw EasyPanel build commands, pass production secrets into the image build or publish private runtime configuration. The registry token is ephemeral and package-write is scoped only to the trusted-main publish job. Registry visibility/access is verified separately before rollout.

References: [EasyPanel builders](https://easypanel.io/docs/builders), [GitHub container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Docker build secrets](https://docs.docker.com/build/building/secrets/).

Status: provider panels are open for owner handoff; no credential has been rotated by this change. Image publication and official source migration require verified outcomes.
