const request = require('request');
const jsdom = require("jsdom");
const Q = require("q");
const dotenv = require('dotenv-safe');
const url = require('url');

const edfParticulierLoginUrl = 'https://particulier.edf.fr/bin/edf_rc/servlets/authentication';
const edfEquilibreStatusUrl = 'https://particulier.edf.fr/bin/edf_rc/servlet/context/equilibreStatus';
const edfSamlUrl = 'https://equilibre.edf.fr/saml-sp';
const edfEquilibreUrl = 'https://equilibre.edf.fr/api/v1/sites/-/monthly-elec-consumptions?begin-month=2015-09&end-month=2017-04&ended=false';

const CONSTANTS = {
  edfLoginRequestName: 'EDF_LOGIN',
  edfEquilibreStatusRequestName: 'EDF_EQUILIBRE_STATUS',
  edfSsoRequestName: 'EDF_SSO',
  edfSamlRequestName: 'EDF_SAML',
  edfEquilibreRequestName: 'EDF_EQUILIBRE',
}

const edfLoginOptions = {
  uri: edfParticulierLoginUrl,
  method: 'POST',
  form: {}
};

const edfEquilibreStatusOptions = {
  uri: edfEquilibreStatusUrl,
  method: 'POST',
  headers: {}
};

const edfSsoOptions = {
  headers: {}
};

const edfSAMLOptions = {
  uri: edfSamlUrl,
  method: 'POST',
  followAllRedirects: true,
  headers: {},
  form: {}
};

let requestCookies;

dotenv.load({
  path: __dirname + '/config/.env',
  sample: __dirname + '/config/.env.example',
  allowEmptyValues: false
});

edfLoginOptions.form = {
  login: process.env.EDF_LOGIN,
  password: process.env.EDF_PASSWORD
};

Q.nfcall(request, edfLoginOptions)
  .then(edfEquilibreStatusCall)
  .then(edfSsoCall)
  .then(edfSAMLCookie)
  .then(setSAMLResponse)
  .then(edfSamlCall)
  .then(edfEquilibreCall)
  .then(response => {
    handlerError(response[0], CONSTANTS.edfEquilibreRequestName);

    console.log('MY CONSOMMATION response.headers',response[0].headers);
    console.log('MY CONSOMMATION response.statusCode',response[0].statusCode);
    console.log('MY CONSOMMATION',response[0].body);
  })
  .catch(err => console.log(err));

function edfEquilibreStatusCall(response) {
  handlerError(response[0], CONSTANTS.edfLoginRequestName);

  requestCookies = response[0].headers['set-cookie'].join(';');
  edfEquilibreStatusOptions.headers.cookie = requestCookies;

  return Q.nfcall(request, edfEquilibreStatusOptions);
}

function edfSsoCall(response) {
  handlerError(response[0], CONSTANTS.edfEquilibreStatusCall);

  const edfEquilibreStatusResponse = response[0].body;

  if (!edfEquilibreStatusResponse.isActiveEquilibre || !edfEquilibreStatusResponse.isEquilibreServiceSubscribed || !edfEquilibreStatusResponse.isEligibleToEquilibreService) {
    throw new Error('Equilibre Service is not available. Please active it on your edf admin panel');
  }

  edfSsoOptions.uri = edfEquilibreStatusResponse.edeliaURL.replace(':443', '');
  edfSsoOptions.headers.cookie = requestCookies;

  return Q.nfcall(request, edfSsoOptions);
}

function edfSAMLCookie(response) {
  handlerError(response[0], CONSTANTS.edfSsoRequestName);

  requestCookies = requestCookies + ';'  + response[0].headers['set-cookie'].join(';');
  edfSAMLOptions.headers.cookie = requestCookies;

  return response[0].body;
}

function setSAMLResponse(body) {
  return Q.nfcall(jsdom.env, body, ["http://code.jquery.com/jquery.js"]);
}

function edfSamlCall (window) {
  edfSAMLOptions.form.SAMLResponse = window.$("input[name='SAMLResponse']").val();

  return Q.nfcall(request, edfSAMLOptions);
}

function edfEquilibreCall(response) {
  handlerError(response[0], CONSTANTS.edfSamlRequestName);
  const queries = parseUrl(response[0].request.uri.hash);

  return Q.nfcall(request, {url: edfEquilibreUrl, headers: {cookie: requestCookies, Authorization: `Bearer ${queries.t}`}});
}

function parseUrl(hash) {
  let HashKeyValueParsed = {};

  hash.substring(8).split('&').forEach(function (x) {
    let arr = x.split('=');
    arr[1] && (HashKeyValueParsed[arr[0]] = arr[1]);
  });

  return HashKeyValueParsed;
}

function handlerError(response, requestName) {
  if(response.statusCode && response.statusCode !== 200 && response.statusCode !== 302) {
    console.log('body', response.body);
    throw `Error while ${requestName}. Server send HTTP ${response.statusCode}`;
  }

  if(typeof response.body  !== 'object') {
    try {
      response.body = JSON.parse(response.body);
    } catch(err) {
      return;
    }
  }

  if(response.body && response.body.errorCode && response.body.Status !== 200) {
    throw `Error while ${requestName}. Server send HTTP ${response.body.Status} with: ${response.body.errorLabel}`;
  }

  return;
}
