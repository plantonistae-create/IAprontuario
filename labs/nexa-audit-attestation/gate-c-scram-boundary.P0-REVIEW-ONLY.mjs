/*
 * NEXA Gate C / Sprint 11.2 -- SCRAM socket-only STATIC contract.
 * NOT an executor. NO database access, environment inspection, credential
 * creation, host changes, PostgreSQL startup or case execution.
 * DO NOT use to approve C01-C10, N01-N09, Gate C, or production.
 *
 * SCRAM can prove distinct authenticated PostgreSQL roles on distinct
 * database sessions IF verified physically. It CANNOT prove distinct
 * Unix accounts, custody of separately controlled passfiles, Supabase
 * Auth.getUser(), legal consent, or clinical audit correctness.
 * The existing peer executor and its hard STOP remain untouched.
 */
export const SCRAM_ACTORS = Object.freeze([
  'nexa_gc_physician_a_lab',
  'nexa_gc_physician_b_lab',
  'nexa_gc_reviewer_lab'
]);
const OBSERVER = 'nexa_gc_observer_lab';
export const REQUIRED_INDEPENDENT_EVIDENCE = Object.freeze([
  'NEW_DISPOSABLE_PG16_CLUSTER_PROVEN',
  'POSTMASTER_EFFECTIVE_CONFIG_AND_COMMAND_LINE_PROVEN',
  'POSTGRESQL_AUTO_CONF_EMPTY_IN_ACTUAL_CLUSTER_PROVEN',
  'UNIX_SOCKET_ANCESTORS_REALPATH_OWNER_AND_MODE_PROVEN',
  'CLIENT_LIBPQ_REQUIRE_AUTH_SCRAM_AND_REQUIREPEER_PROVEN',
  'SERVER_AUTH_METHOD_HBA_LINE_AND_BACKEND_PID_CORRELATED',
  'SENSITIVE_LOGGING_POLICY_AND_PASSWORD_NONDISCLOSURE_PROVEN',
  'UNIX_SOCKET_ONLY_NO_TCP_LISTENER_PROVEN',
  'SCRAM_PASSWORD_AUTH_SUCCESS_FOR_EACH_DB_LOGIN',
  'WRONG_PASSWORD_REJECTED_FOR_EACH_DB_LOGIN',
  'CROSS_ACTOR_CREDENTIALS_REJECTED_FOR_EACH_PAIR',
  'SESSION_USER_EQUALS_EXPECTED_AUTHENTICATED_LOGIN',
  'ROLE_GRAPH_NO_MEMBERSHIP_OR_SET_ROLE_ESCALATION',
  'NO_SUPERUSER_BYPASSRLS_CREATE_ROLE_OR_PROTECTED_OWNERSHIP',
  'PER_ACTOR_CREDENTIAL_CUSTODY_INDEPENDENTLY_REVIEWED',
  'SQL_CASES_C01_C10_AND_C07_C08_BARRIERS_SEPARATELY_APPROVED',
  'EXTERNAL_ISOLATION_INDEPENDENTLY_PROVEN'
]);

const stop = (code) => Object.freeze({
  verdict: 'STOP_' + code,
  staticProfile: 'NOT_ACCEPTED',
  independentDbAuth: 'NOT_PROVEN',
  independentUnixActors: 'NOT_PROVEN',
  caseResults: 'C01_C10_NOT_RUN;N01_N09_NOT_RUN',
  gateC: 'NO_GO_0_OF_19'
});
const normalizedActiveLines = (value) => {
  if (typeof value !== 'string' || value.length > 20000 ||
      value.includes('\0') || value.includes('\r') ||
      value.split('\n').some(line => line.trim() &&
        !line.trim().startsWith('#') && line.includes('#'))) return null;
  // PostgreSQL HBA permits backslash continuation even in comments.
  // Refuse any continuation or tab rather than emulate its parser.
  if (value.split('\n').some(line => line.endsWith('\\') ||
      line.includes('\\') || line.includes('\t'))) return null;
  const lines = value.split('\n').map(x => x.trim())
    .filter(x => x && !x.startsWith('#'));
  return lines.every(line => /^[\x20-\x7e]+$/.test(line)) ? lines : null;
};
const same = (a,b) => a && a.length === b.length &&
  a.every((line,i) => line === b[i]);

/**
 * Pure static comparison for a NEW isolated lab, given already-reviewed
 * configuration text. It CANNOT assert that a running postmaster loaded
 * these files or that their paths/permissions/identities are real.
 * It never handles secrets, passfiles, passwords, data, or SQL queries.
 */
export function reviewScramStaticProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return stop('INPUT_INVALID');
  const {database, socketPath, postgresqlConf, postgresqlAutoConf,
    pgHbaConf, pgIdentConf} = input;
  if (typeof database !== 'string' ||
      !/^nexa_gate_c_lab_[a-z0-9_]{1,40}$/.test(database))
    return stop('SYNTHETIC_DATABASE_SCOPE');
  // Reject shared /tmp or arbitrary absolute paths. This is a textual
  // scope guard only: actual realpath/uid/modes require physical review.
  if (typeof socketPath !== 'string' ||
      !/^\/Users\/[A-Za-z0-9._-]+\/Documents\/NEXA\/sprint11-3b-scram-[A-Za-z0-9_-]{6,64}\/socket$/.test(socketPath))
    return stop('NEW_SOCKET_DIRECTORY_SCOPE');

  const conf = normalizedActiveLines(postgresqlConf);
  const auto = normalizedActiveLines(postgresqlAutoConf);
  const hba = normalizedActiveLines(pgHbaConf);
  const ident = normalizedActiveLines(pgIdentConf);
  if (!conf || !auto || !hba || !ident) return stop('CONFIG_TEXT_INVALID');
  if (auto.length !== 0) return stop('AUTO_CONF_OVERRIDE_UNREVIEWED');

  // Pinned active assignments, no include/override/fallback. The caller
  // must still independently match these to pg_settings and postmaster args.
  const expectedConf = [
    "listen_addresses = ''",
    "unix_socket_directories = '" + socketPath + "'",
    'unix_socket_permissions = 0700',
    "password_encryption = 'scram-sha-256'",
    'log_connections = on',
    "log_statement = 'none'",
    "log_min_error_statement = 'PANIC'",
    'log_parameter_max_length_on_error = 0',
    "log_line_prefix = '%m [%p] '"
  ];
  if (!same(conf,expectedConf)) return stop('POSTGRESQL_CONFIG_UNREVIEWED');
  // HBA first-match semantics. Only the three synthetic actors and the
  // read-only observer are candidates; all remaining local/host roles denied.
  const expectedHba = [
    ...[...SCRAM_ACTORS,OBSERVER].map(role =>
      'local ' + database + ' ' + role + ' scram-sha-256'),
    'local all all reject',
    'host all all 0.0.0.0/0 reject',
    'host all all ::/0 reject'
  ];
  if (!same(hba,expectedHba)) return stop('HBA_RULES_OR_ORDER_UNREVIEWED');
  if (ident.length !== 0) return stop('IDENT_MAPPING_UNREVIEWED');

  return Object.freeze({
    verdict: 'STATIC_SCRAM_PROFILE_MATCH_ONLY',
    staticProfile: 'REVIEWABLE_NOT_EXECUTABLE',
    independentDbAuth: 'NOT_PROVEN',
    independentUnixActors: 'NOT_PROVEN',
    effectivePostmasterConfiguration: 'NOT_PROVEN',
    observedScramAuthenticationMethod: 'NOT_PROVEN',
    clientRequireAuthAndRequirePeer: 'NOT_PROVEN',
    socketRealpathOwnershipAndMode: 'NOT_PROVEN',
    credentialCustody: 'NOT_PROVEN',
    actorPositiveAndCrossNegative: 'NOT_RUN',
    privilegedRoleChecks: 'NOT_RUN',
    casesApproved: false,
    caseResults: 'C01_C10_NOT_RUN;N01_N09_NOT_RUN',
    gateC: 'NO_GO_0_OF_19'
  });
}
