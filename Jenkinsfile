// PR checks for Boardly: ESLint, typecheck, unit tests, Docker image builds and the Selenium suite.
// Runs as a Multibranch Pipeline. The agent needs Docker with Compose v2.24+ (for `!reset` in
// docker-compose.ci.yml) and the Jenkins user must be in the docker group.

def COMPOSE = 'docker compose -f docker-compose.yml -f docker-compose.ci.yml --profile mail --profile e2e'
def NODE_IMAGE = 'node:22-alpine'
// Keep npm's cache out of the read-only container home directory.
def NODE_ARGS = '-e npm_config_cache=/tmp/.npm'

pipeline {
  agent any

  options {
    timeout(time: 45, unit: 'MINUTES')
    timestamps()
    disableConcurrentBuilds(abortPrevious: true)
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  stages {
    stage('Prepare') {
      steps {
        script {
          // One Compose project per build so parallel builds never share containers or volumes.
          env.COMPOSE_PROJECT_NAME = "boardly-${env.BUILD_TAG}".toLowerCase().replaceAll(/[^a-z0-9_-]/, '-')
        }
        sh 'rm -rf test-results && mkdir -p test-results'
      }
    }

    stage('Checks') {
      parallel {
        stage('Backend') {
          agent {
            docker {
              image NODE_IMAGE
              args NODE_ARGS
              reuseNode true
            }
          }
          stages {
            stage('Backend: install') {
              steps { dir('backend') { sh 'npm ci --no-audit --no-fund' } }
            }
            stage('Backend: ESLint') {
              steps { dir('backend') { sh 'npm run lint' } }
            }
            stage('Backend: unit tests') {
              steps {
                dir('backend') {
                  sh 'npm test -- --reporter=default --reporter=junit --outputFile.junit=../test-results/backend-unit.xml'
                }
              }
            }
          }
        }

        stage('Frontend') {
          agent {
            docker {
              image NODE_IMAGE
              args NODE_ARGS
              reuseNode true
            }
          }
          stages {
            stage('Frontend: install') {
              steps { dir('frontend') { sh 'npm ci --no-audit --no-fund' } }
            }
            stage('Frontend: ESLint') {
              steps { dir('frontend') { sh 'npm run lint' } }
            }
            stage('Frontend: typecheck') {
              steps { dir('frontend') { sh 'npm run typecheck' } }
            }
            stage('Frontend: unit tests') {
              steps {
                dir('frontend') {
                  sh 'npm test -- --reporter=default --reporter=junit --outputFile.junit=../test-results/frontend-unit.xml'
                }
              }
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

    stage('Build images') {
      steps {
        // Builds the backend (tsc + prisma generate), the frontend (next build) and the Selenium runner.
        sh "${COMPOSE} build"
      }
    }

    stage('Selenium E2E') {
      steps {
        sh "${COMPOSE} up -d --wait"
        // Run as the Jenkins user so the JUnit report in the workspace isn't owned by root.
        sh "E2E_UID=\$(id -u) E2E_GID=\$(id -g) ${COMPOSE} run --rm e2e"
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'test-results/e2e.xml'
        }
        failure {
          sh "${COMPOSE} logs --no-color --tail=200 || true"
        }
      }
    }
  }

  post {
    always {
      // --rmi local drops this build's images; BuildKit's layer cache keeps the next build fast.
      sh "${COMPOSE} down -v --rmi local --remove-orphans || true"
    }
  }
}
