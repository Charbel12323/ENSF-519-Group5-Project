// CI for Boardly, run as a Multibranch Pipeline.
//
// Pull requests: install, ESLint, typecheck, unit tests and `npm run build` for the backend and
// the frontend. No Docker images are built.
//
// main: the same checks, then the Docker images are built and the Selenium suite runs against them.
//
// The agent needs Docker (the Node steps run in a node:22-alpine container) with Compose v2.24+
// for `!reset` in docker-compose.ci.yml, and the Jenkins user must be in the docker group.
// The CI machine has 2 GB of RAM, so everything heavy runs one step at a time.

// The e2e profile is only added where it's needed; with it, `up` would also start a second test run.
def COMPOSE = 'docker compose -f docker-compose.yml -f docker-compose.ci.yml --profile mail'
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
        sh 'rm -rf test-results && mkdir -p test-results'
      }
    }

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
        stage('Backend: build') {
          // prisma generate + tsc
          steps { dir('backend') { sh 'npm run build' } }
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'test-results/backend-unit.xml'
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
        stage('Frontend: build') {
          // next build --webpack (see next.config.js for the memory settings)
          steps { dir('frontend') { sh 'npm run build' } }
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'test-results/frontend-unit.xml'
        }
      }
    }

    stage('Build images') {
      when { branch 'main' }
      steps {
        script {
          // One Compose project per build so builds never share containers or volumes.
          env.COMPOSE_PROJECT_NAME = "boardly-${env.BUILD_TAG}".toLowerCase().replaceAll(/[^a-z0-9_-]/, '-')
        }
        // One image at a time; `compose build` would otherwise build all three in parallel.
        sh "${COMPOSE} build backend"
        sh "${COMPOSE} build frontend"
        sh "${COMPOSE} --profile e2e build e2e"
      }
    }

    stage('Selenium E2E') {
      when { branch 'main' }
      steps {
        sh "${COMPOSE} up -d --wait"
        // Run as the Jenkins user so the JUnit report in the workspace isn't owned by root.
        sh "E2E_UID=\$(id -u) E2E_GID=\$(id -g) ${COMPOSE} --profile e2e run --rm e2e"
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
      script {
        if (env.COMPOSE_PROJECT_NAME) {
          // --rmi local drops this build's images; BuildKit's layer cache keeps the next build fast.
          sh "${COMPOSE} --profile e2e down -v --rmi local --remove-orphans || true"
        }
      }
    }
  }
}
