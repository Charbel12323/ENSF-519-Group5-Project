// CI/CD for Boardly, run as a Multibranch Pipeline.
//
// Every branch is built and tested; main is then deployed. Each build reports its steps to GitHub as separate checks.
//
// Every build (pull requests and main):
//   Jenkins / Unit tests               Vitest for the backend and the frontend
//   Jenkins / Lint, typecheck & build  ESLint, tsc and both production builds
//   Jenkins / Selenium E2E             builds the Docker images, starts the app, runs the browser suite
//
// main only, and only if every check above passed in this same build:
//   Jenkins / Publish images           builds boardly-backend and boardly-frontend, pushes them to Docker Hub
//   Jenkins / Provision server         Terraform creates the Kubernetes server, or puts it back as described
//   Jenkins / Configure server         Ansible connects to it and installs Kubernetes (k3s)
//   Jenkins / Run containers           Ansible deploys the new images to Kubernetes and smoke-tests the app
//   Jenkins / Kubernetes orchestration scales the backend, deletes a pod to show self-healing, shows the history
// The last four run on the Ansible server, from this commit's deploy/ folder (see deploy/README.md).
//
// The checks are posted with githubNotify from the "Pipeline: GitHub Notify Step" plugin, which reuses
// the GitHub credentials of the multibranch source and posts to the PR's head commit.
//
// Jenkins setup for main (see deploy/README.md, which also covers the Ansible server):
//   dockerhub-creds  Username with password: Docker Hub username and access token
//   ansible-ssh-key  SSH Username with private key: login for the Ansible server
//   ANSIBLE_HOST     global environment variable: address of the Ansible server
//
// The agent needs Docker (the Node steps run in a node:22-alpine container) with Compose v2.24+
// for `!reset` in docker-compose.ci.yml, and the Jenkins user must be in the docker group.
// The CI machine has 2 GB of RAM, so everything heavy runs one step at a time.

import groovy.transform.Field

@Field final Map CHECKS = [
  unit   : 'Jenkins / Unit tests',
  build  : 'Jenkins / Lint, typecheck & build',
  e2e    : 'Jenkins / Selenium E2E',
  publish    : 'Jenkins / Publish images',
  provision  : 'Jenkins / Provision server',
  configure  : 'Jenkins / Configure server',
  run        : 'Jenkins / Run containers',
  orchestrate: 'Jenkins / Kubernetes orchestration',
]
@Field final List DEPLOY_CHECKS = ['provision', 'configure', 'run', 'orchestrate']

// ssh to the Ansible server, inside withAnsibleSsh.
@Field final String SSH_TO_ANSIBLE =
  'ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$ANSIBLE_HOST"'

// A newer push to a PR cancels the running build, but a deploy on main is never cut off halfway;
// main builds queue up instead. Declarative `options` can't vary by branch, hence `properties`.
properties([
  disableConcurrentBuilds(abortPrevious: env.BRANCH_NAME != 'main'),
  buildDiscarder(logRotator(numToKeepStr: '30')),
])
// Last status posted per check, so the final post block can close any that never finished.
@Field Map checkStatus = [:]

// The e2e profile is only added where it's needed; with it, `up` would also start a second test run.
def COMPOSE = 'docker compose -f docker-compose.yml -f docker-compose.ci.yml --profile mail'
def NODE_IMAGE = 'node:22-alpine'
// Keep npm's cache out of the read-only container home directory.
def NODE_ARGS = '-e npm_config_cache=/tmp/.npm'

void report(String key, String status, String description) {
  checkStatus[key] = status
  try {
    githubNotify context: CHECKS[key], status: status, description: description
  } catch (InterruptedException e) {
    throw e
  } catch (NoSuchMethodError e) {
    echo "WARNING: install the 'Pipeline: GitHub Notify Step' plugin to see each check on GitHub."
  } catch (Exception e) {
    echo "WARNING: could not post '${CHECKS[key]}' to GitHub: ${e.message}"
  }
}

String elapsedSince(long startMs) {
  long s = (currentBuild.duration - startMs).intdiv(1000)
  return s >= 60 ? "${s.intdiv(60)}m ${s % 60}s" : "${s}s"
}

// Runs body as one GitHub check: pending while it runs, then success or failure with the time taken.
void check(String key, Closure body) {
  long start = currentBuild.duration
  report(key, 'PENDING', 'Running')
  try {
    body()
  } catch (e) {
    report(key, 'FAILURE', "Failed after ${elapsedSince(start)}")
    throw e
  }
  report(key, 'SUCCESS', "Passed in ${elapsedSince(start)}")
}

void withAnsibleSsh(Closure body) {
  withCredentials([sshUserPrivateKey(credentialsId: 'ansible-ssh-key',
                                     keyFileVariable: 'SSH_KEY',
                                     usernameVariable: 'SSH_USER')]) {
    body()
  }
}

// Runs script with bash on the Ansible server, in the folder 'Provision server' copied this commit's
// deploy/ files to. IMAGE_TAG and IMAGE_REPO are passed along.
void onAnsible(String label, String script) {
  writeFile file: '.on-ansible.sh', text: "set -euo pipefail\n${script}\n"
  withAnsibleSsh {
    sh label: label, script: """
      ${SSH_TO_ANSIBLE} \\
        "cd ~/boardly-deploy/\$IMAGE_TAG && IMAGE_TAG='\$IMAGE_TAG' IMAGE_REPO='\${IMAGE_REPO:-}' ANSIBLE_NOCOLOR=1 bash -s" \\
        < .on-ansible.sh
    """
  }
}

pipeline {
  agent any

  options {
    // A main build that creates a new server spends about 10 extra minutes setting it up.
    timeout(time: 60, unit: 'MINUTES')
    timestamps()
  }

  stages {
    stage('Install') {
      agent {
        docker {
          image NODE_IMAGE
          args NODE_ARGS
          reuseNode true
        }
      }
      steps {
        script {
          report('unit', 'PENDING', 'Waiting for npm install')
          report('build', 'PENDING', 'Waiting for npm install')
          report('e2e', 'PENDING', 'Waiting for npm install')
        }
        sh label: 'Reset test results', script: 'rm -rf test-results && mkdir -p test-results'
        sh label: 'Backend: npm ci', script: 'cd backend && npm ci --no-audit --no-fund'
        sh label: 'Frontend: npm ci', script: 'cd frontend && npm ci --no-audit --no-fund'
      }
    }

    stage('Unit tests') {
      agent {
        docker {
          image NODE_IMAGE
          args NODE_ARGS
          reuseNode true
        }
      }
      steps {
        // Mark the stage failed but keep going, so the build check still reports its own result.
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          script {
            check('unit') {
              sh label: 'Backend unit tests',
                 script: 'cd backend && npm test -- --reporter=default --reporter=junit --outputFile.junit=../test-results/backend-unit.xml'
              sh label: 'Frontend unit tests',
                 script: 'cd frontend && npm test -- --reporter=default --reporter=junit --outputFile.junit=../test-results/frontend-unit.xml'
            }
          }
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'test-results/*-unit.xml'
        }
      }
    }

    stage('Lint, typecheck & build') {
      agent {
        docker {
          image NODE_IMAGE
          args NODE_ARGS
          reuseNode true
        }
      }
      steps {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          script {
            check('build') {
              sh label: 'Backend: ESLint', script: 'cd backend && npm run lint'
              // prisma generate + tsc, which also type-checks the backend
              sh label: 'Backend: build', script: 'cd backend && npm run build'
              sh label: 'Frontend: ESLint', script: 'cd frontend && npm run lint'
              sh label: 'Frontend: typecheck', script: 'cd frontend && npm run typecheck'
              // next build --webpack (see next.config.js for the memory settings)
              sh label: 'Frontend: build', script: 'cd frontend && npm run build'
            }
          }
        }
      }
    }

    stage('Selenium E2E') {
      when {
        // Not worth the time and memory if the code doesn't build or pass its unit tests.
        expression { currentBuild.currentResult == 'SUCCESS' }
      }
      steps {
        script {
          // One Compose project per build so builds never share containers or volumes.
          env.COMPOSE_PROJECT_NAME = "boardly-${env.BUILD_TAG}".toLowerCase().replaceAll(/[^a-z0-9_-]/, '-')
          check('e2e') {
            // One image at a time; `compose build` would otherwise build all three in parallel.
            sh label: 'Build backend image', script: "${COMPOSE} build backend"
            sh label: 'Build frontend image', script: "${COMPOSE} build frontend"
            sh label: 'Build Selenium image', script: "${COMPOSE} --profile e2e build e2e"
            try {
              sh label: 'Start the app', script: "${COMPOSE} up -d --wait"
              // Run as the Jenkins user so the JUnit report in the workspace isn't owned by root.
              sh label: 'Run the Selenium suite',
                 script: "E2E_UID=\$(id -u) E2E_GID=\$(id -g) ${COMPOSE} --profile e2e run --rm e2e"
            } catch (e) {
              sh label: 'Container logs', script: "${COMPOSE} logs --no-color --tail=200 || true"
              throw e
            }
          }
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'test-results/e2e.xml'
        }
      }
    }

    stage('Publish images') {
      when {
        branch 'main'
        // Only ship code that built and passed every test in this run.
        expression { currentBuild.currentResult == 'SUCCESS' }
      }
      steps {
        script {
          for (String key in DEPLOY_CHECKS) {
            report(key, 'PENDING', 'Waiting for the images')
          }
          env.IMAGE_TAG = sh(script: 'git rev-parse --short=7 HEAD', returnStdout: true).trim()
          check('publish') {
            withCredentials([usernamePassword(credentialsId: 'dockerhub-creds',
                                              usernameVariable: 'DOCKERHUB_USER',
                                              passwordVariable: 'DOCKERHUB_TOKEN')]) {
              env.IMAGE_REPO = env.DOCKERHUB_USER
              // Built through Compose, like the PR builds: the Dockerfiles need BuildKit, which Compose
              // brings along, while plain `docker build` on the agent falls back to the legacy builder.
              // One image at a time to stay within 2 GB. Each is tagged with the commit and as latest;
              // deploys always use the commit tag.
              for (String app in ['backend', 'frontend']) {
                sh label: "Build ${app} image", script: """
                  COMPOSE_PROJECT_NAME=boardly-publish docker compose -f docker-compose.yml build ${app}
                  docker tag boardly-publish-${app} "\$DOCKERHUB_USER/boardly-${app}:\$IMAGE_TAG"
                  docker tag boardly-publish-${app} "\$DOCKERHUB_USER/boardly-${app}:latest"
                """
              }
              sh label: 'Log in to Docker Hub', script: 'echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin'
              try {
                for (String app in ['backend', 'frontend']) {
                  sh label: "Push ${app} image", script: """
                    docker push "\$DOCKERHUB_USER/boardly-${app}:\$IMAGE_TAG"
                    docker push "\$DOCKERHUB_USER/boardly-${app}:latest"
                  """
                }
              } finally {
                sh label: 'Log out of Docker Hub', script: 'docker logout'
              }
            }
          }
        }
      }
      post {
        always {
          // Keep :latest as the layer cache for the next build; drop the commit tags and replaced images.
          sh label: 'Clean up local images', script: '''
            [ -n "${IMAGE_REPO:-}" ] || exit 0
            docker image rm "$IMAGE_REPO/boardly-backend:$IMAGE_TAG" "$IMAGE_REPO/boardly-frontend:$IMAGE_TAG" 2>/dev/null || true
            docker image prune -f >/dev/null
          '''
        }
      }
    }

    // The four deploy stages run on the Ansible server. The inventory run.sh writes to ~/.boardly tells
    // Ansible where the server Terraform created is.

    stage('Provision server') {
      when {
        branch 'main'
        expression { currentBuild.currentResult == 'SUCCESS' }
      }
      steps {
        script {
          check('provision') {
            withAnsibleSsh {
              sh label: 'Copy deploy/ to the Ansible server', script: """
                set -eu
                : "\${ANSIBLE_HOST:?Set ANSIBLE_HOST in Manage Jenkins > System > Global properties}"
                dir="boardly-deploy/\$IMAGE_TAG"
                # touch: tar restores the folder's old timestamp, and the cleanup below sorts by time.
                tar -czf - -C deploy . | ${SSH_TO_ANSIBLE} "rm -rf ~/\$dir && mkdir -p ~/\$dir && tar -xzf - -C ~/\$dir && touch ~/\$dir"
                # Keep the last 5 releases' files on the Ansible server.
                ${SSH_TO_ANSIBLE} 'cd ~/boardly-deploy && ls -1t | tail -n +6 | xargs -r rm -rf'
              """
            }
            onAnsible('Terraform apply', 'bash terraform/run.sh apply "$IMAGE_TAG"')
          }
        }
      }
    }

    stage('Configure server') {
      when {
        branch 'main'
        expression { currentBuild.currentResult == 'SUCCESS' }
      }
      steps {
        script {
          check('configure') {
            onAnsible('Install Kubernetes (k3s) with Ansible',
                      'cd ansible && ansible-playbook -i ~/.boardly/inventory.ini k8s-node.yml')
          }
        }
      }
    }

    stage('Run containers') {
      when {
        branch 'main'
        expression { currentBuild.currentResult == 'SUCCESS' }
      }
      steps {
        script {
          check('run') {
            onAnsible('Deploy the images to Kubernetes with Ansible', '''
              cd ansible
              ansible-playbook -i ~/.boardly/inventory.ini deploy.yml \\
                -e "frontend_image=$IMAGE_REPO/boardly-frontend:$IMAGE_TAG" \\
                -e "backend_image=$IMAGE_REPO/boardly-backend:$IMAGE_TAG"
            ''')
          }
        }
      }
    }

    stage('Kubernetes orchestration') {
      when {
        branch 'main'
        expression { currentBuild.currentResult == 'SUCCESS' }
      }
      steps {
        script {
          check('orchestrate') {
            onAnsible('Scale, self-heal and show the rollout history',
                      'cd ansible && ansible-playbook -i ~/.boardly/inventory.ini orchestrate.yml')
          }
        }
      }
    }
  }

  post {
    always {
      script {
        // Close any check that never ran, so GitHub doesn't show it as pending forever.
        String why = currentBuild.currentResult == 'ABORTED' ? 'the build was aborted' : 'an earlier step failed'
        for (String key in CHECKS.keySet().toList()) {
          if (checkStatus[key] == 'PENDING') {
            report(key, 'ERROR', "Did not run because ${why}")
          }
        }
        if (env.COMPOSE_PROJECT_NAME) {
          // --rmi local drops this build's images; BuildKit's layer cache keeps the next build fast.
          sh label: 'Tear down', script: "${COMPOSE} --profile e2e down -v --rmi local --remove-orphans || true"
        }
      }
    }
  }
}
