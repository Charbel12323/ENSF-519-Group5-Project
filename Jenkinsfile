// CI/CD for Boardly, run as a Multibranch Pipeline.
//
// Pull requests are tested; main is deployed. Each build reports its steps to GitHub as separate checks.
//
// Pull requests (and any branch other than main):
//   Jenkins / Unit tests               Vitest for the backend and the frontend
//   Jenkins / Lint, typecheck & build  ESLint, tsc and both production builds
//   Jenkins / Selenium E2E             builds the Docker images, starts the app, runs the browser suite
//
// main (the code was already tested in its PR, so nothing is re-tested):
//   Jenkins / Publish images           builds boardly-backend and boardly-frontend, pushes them to Docker Hub
//   Jenkins / Deploy                   runs deploy/ansible/deploy.yml on the Ansible server with those images
//
// The checks are posted with githubNotify from the "Pipeline: GitHub Notify Step" plugin, which reuses
// the GitHub credentials of the multibranch source and posts to the PR's head commit.
//
// Jenkins setup for main (see deploy/README.md):
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
  publish: 'Jenkins / Publish images',
  deploy : 'Jenkins / Deploy',
]

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

pipeline {
  agent any

  options {
    timeout(time: 45, unit: 'MINUTES')
    timestamps()
  }

  stages {
    stage('Install') {
      when { not { branch 'main' } }
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
      when { not { branch 'main' } }
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
      when { not { branch 'main' } }
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
        not { branch 'main' }
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
      when { branch 'main' }
      steps {
        script {
          report('deploy', 'PENDING', 'Waiting for the images')
          env.IMAGE_TAG = sh(script: 'git rev-parse --short=7 HEAD', returnStdout: true).trim()
          check('publish') {
            withCredentials([usernamePassword(credentialsId: 'dockerhub-creds',
                                              usernameVariable: 'DOCKERHUB_USER',
                                              passwordVariable: 'DOCKERHUB_TOKEN')]) {
              env.IMAGE_REPO = env.DOCKERHUB_USER
              // One image at a time to stay within 2 GB. Each is tagged with the commit and as latest;
              // deploys always use the commit tag.
              for (String app in ['backend', 'frontend']) {
                sh label: "Build ${app} image", script: """
                  docker build -t "\$DOCKERHUB_USER/boardly-${app}:\$IMAGE_TAG" -t "\$DOCKERHUB_USER/boardly-${app}:latest" ${app}
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

    stage('Deploy') {
      when { branch 'main' }
      steps {
        script {
          check('deploy') {
            withCredentials([sshUserPrivateKey(credentialsId: 'ansible-ssh-key',
                                               keyFileVariable: 'SSH_KEY',
                                               usernameVariable: 'SSH_USER')]) {
              // Copy this commit's deploy/ folder to the Ansible server, then run the playbook there.
              sh label: 'Run the Ansible deploy', script: '''
                set -eu
                : "${ANSIBLE_HOST:?Set ANSIBLE_HOST in Manage Jenkins > System > Global properties}"
                on_ansible() {
                  ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$ANSIBLE_HOST" "$@"
                }
                dir="boardly-deploy/$IMAGE_TAG"
                # touch: tar restores the folder's old timestamp, and the cleanup below sorts by time.
                tar -czf - -C deploy . | on_ansible "rm -rf ~/$dir && mkdir -p ~/$dir && tar -xzf - -C ~/$dir && touch ~/$dir"
                on_ansible "cd ~/$dir/ansible && ansible-playbook deploy.yml \
                  -e frontend_image=$IMAGE_REPO/boardly-frontend:$IMAGE_TAG \
                  -e backend_image=$IMAGE_REPO/boardly-backend:$IMAGE_TAG"
                # Keep the last 5 releases' files on the Ansible server.
                on_ansible 'cd ~/boardly-deploy && ls -1t | tail -n +6 | xargs -r rm -rf'
              '''
            }
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
