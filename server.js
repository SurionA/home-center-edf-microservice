const request = require('request-promise');
const jsdom = require('jsdom');
const Q = require('q');
const dotenv = require('dotenv-safe');
const path = require('path');

const startDate = '2015-09';
const endDate = '2017-04';

const edfParticulierLoginUrl = 'https://particulier.edf.fr/bin/edf_rc/servlets/authentication';
const edfEquilibreStatusUrl = 'https://particulier.edf.fr/bin/edf_rc/servlet/context/equilibreStatus';
const edfSamlUrl = 'https://equilibre.edf.fr/saml-sp';
const edfEquilibreUrl = `https://equilibre.edf.fr/api/v1/sites/-/monthly-elec-consumptions?begin-month=${startDate}&end-month=${endDate}&ended=false`;

const CONSTANTS = {
  edfLoginRequestName: 'EDF_LOGIN',
  edfEquilibreStatusRequestName: 'EDF_EQUILIBRE_STATUS',
  edfSsoRequestName: 'EDF_SSO',
  edfSamlRequestName: 'EDF_SAML',
  edfEquilibreRequestName: 'EDF_EQUILIBRE',
  edfEquilibreBaseHash: '#/login?',
};

const edfLoginOptions = {
  resolveWithFullResponse: true,
  uri: edfParticulierLoginUrl,
  method: 'POST',
  form: {},
};

const edfEquilibreStatusOptions = {
  resolveWithFullResponse: true,
  uri: edfEquilibreStatusUrl,
  method: 'POST',
  headers: {},
};

const edfSsoOptions = {
  resolveWithFullResponse: true,
  headers: {},
};

const edfSAMLOptions = {
  resolveWithFullResponse: true,
  uri: edfSamlUrl,
  method: 'POST',
  followAllRedirects: true,
  headers: {},
  form: {},
};

const edfEquilibreOptions = {
  resolveWithFullResponse: true,
  uri: edfEquilibreUrl,
  headers: {},
};

let requestCookies;

dotenv.load({
  path: path.join(__dirname, 'config/.env'),
  sample: path.join(__dirname, 'config/.env.example'),
  allowEmptyValues: false,
});

edfLoginOptions.form = {
  login: process.env.EDF_LOGIN,
  password: process.env.EDF_PASSWORD,
};

request(edfLoginOptions)
  .then(edfEquilibreStatusCall)
  .then(edfSsoCall)
  .then(edfSAMLCookie)
  .then(setSAMLResponse)
  .then(edfSamlCall)
  .then(edfEquilibreCall)
  .then((response) => {
    handlerError(response, CONSTANTS.edfEquilibreRequestName);

    console.log('MY CONSOMMATION response.headers', response.headers);
    console.log('MY CONSOMMATION response.statusCode', response.statusCode);
    console.log('MY CONSOMMATION', response.body);
  })
  .catch(err => console.log(err));

function edfEquilibreStatusCall(response) {
  handlerError(response, CONSTANTS.edfLoginRequestName);

  requestCookies = response.headers['set-cookie'].join(';');
  edfEquilibreStatusOptions.headers.cookie = requestCookies;

  return request(edfEquilibreStatusOptions);
}

function edfSsoCall(response) {
  handlerError(response, CONSTANTS.edfEquilibreStatusCall);

  const edfEquilibreStatusResponse = response.body;

  if (!edfEquilibreStatusResponse.isActiveEquilibre ||
      !edfEquilibreStatusResponse.isEquilibreServiceSubscribed ||
      !edfEquilibreStatusResponse.isEligibleToEquilibreService) {
    throw new Error('Equilibre Service is not available. Please active it on your edf admin panel');
  }

  edfSsoOptions.uri = edfEquilibreStatusResponse.edeliaURL.replace(':443', '');
  edfSsoOptions.headers.cookie = requestCookies;

  return request(edfSsoOptions);
}

function edfSAMLCookie(response) {
  handlerError(response, CONSTANTS.edfSsoRequestName);

  requestCookies = `${requestCookies};${response.headers['set-cookie'].join(';')}`;
  edfSAMLOptions.headers.cookie = requestCookies;

  return response.body;
}

function setSAMLResponse(body) {
  return Q.nfcall(jsdom.env, body, ['http://code.jquery.com/jquery.js']);
}

function edfSamlCall(window) {
  edfSAMLOptions.form.SAMLResponse = window.$("input[name='SAMLResponse']").val();

  return request(edfSAMLOptions);
}

function edfEquilibreCall(response) {
  handlerError(response, CONSTANTS.edfSamlRequestName);
  const queries = parseUrl(response.request.uri.hash);

  edfEquilibreOptions.headers.cookie = requestCookies;
  edfEquilibreOptions.headers.Authorization = `Bearer ${queries.t}`;

  return request(edfEquilibreOptions);
}

function parseUrl(hash) {
  const HashKeyValueParsed = {};

  hash.substring(CONSTANTS.edfEquilibreBaseHash.length).split('&').forEach((x) => {
    const params = x.split('=');
    return params[1] && (HashKeyValueParsed[params[0]] = params[1]);
  });

  return HashKeyValueParsed;
}

function handlerError(response, requestName) {
  if (response.statusCode && response.statusCode !== 200 && response.statusCode !== 302) {
    throw new Error(`Error while ${requestName}. Server send HTTP ${response.statusCode}`);
  }

  if (typeof response.body !== 'object') {
    try {
      response.body = JSON.parse(response.body);
    } catch (err) {
      return;
    }
  }

  if (response.body && response.body.errorCode && response.body.Status !== 200) {
    throw new Error(`Error while ${requestName}. Server send HTTP ${response.body.Status} with: ${response.body.errorLabel}`);
  }
}
