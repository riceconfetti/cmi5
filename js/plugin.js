const XAPI_VERSION = "1.0.3",
  SUSPEND_DATA_KEY = "suspendData",
  VERB_ANSWERED = "http://adlnet.gov/expapi/verbs/answered",
  VERB_EXPERIENCED_OBJ = {
    id: "http://adlnet.gov/expapi/verbs/experienced",
    display: {
      "en-US": "experienced",
    },
  };

/** ADDITIONAL VERBS TEMPLATE*/
/**
 * VERB_NAME = {
 *    id: "LINK TO ADL VERB"
 *    display: {
 *        "en-US": "VERB"
 *    },
 * }
 */

function CoursePlugin() {
  this.cmi5 = null;
  this.passingScore = Number.NaN;
  this.activeStatements = 0;
  this.callbackOnStatementSend = null;
  this.launchMode = "";
  this.statementBatch = [];
}

CoursePlugin.prototype.initialize = function (
  callbackOnInit,
  callbackOnStatementSend
) {
  this.callbackOnStatementSend = callbackOnStatementSend;
  this.cmi5 = new Cmi5(document.location.href);
  if (!this.cmi5.getEndpoint()) {
    this.cmi5 = null;
  } else {
    this.cmi5.start({
      launchData: (err) => {
        if (err) {
          console.log("error occurred fetching launchData", err);
          alert("Unable to retrieve launch data, reason: " + err);
        }

        this.launchMode = this.cmi5.getLaunchMode();
        let masteryScore = this.cmi5.getMasteryScore();
        if (masteryScore !== null) {
          this.passingScore = parseFloat(masteryScore);
        }
      },
      initializeStatement: (err) => {
        if (err) {
          console.log("error occurred sending initialized statement", err);
          alert("Unable to initialize, reason: " + err);
        } else {
          callbackOnInit();
        }
      },
    });
  }
};

CoursePlugin.prototype.canSave = function () {
  return this._shouldSendStatement();
};

CoursePlugin.prototype.getEndpoint = function () {
  let endpoint = this.cmi5.getEndpoint();
  if (endpoint[endpoint.length - 1] !== "/") {
    endpoint = endpoint + "/";
  }

  return endpoint;
};

CoursePlugin.prototype.getActivityState = function (stateId) {
  return fetch(
    this.getEndpoint() +
      "activities/state?" +
      new URLSearchParams({
        stateId: stateId,
        activityId: this.cmi5.getActivityId(),
        agent: JSON.stringify(this.cmi5.getActor()),
        registraction: this.cmi5.getRegistration(),
      }),
    {
      mode: "cors",
      method: "get",
      headers: {
        "X-Experience-API-Version": XAPI_VERSION,
        Authorization: this.cmi5.getAuth(),
      },
    }
  )
    .then((response) => {
      if (response.status === 200) {
        return response.json();
      } else {
        return Promise.resolve("");
      }
    })
    .catch((ex) => {
      throw new Error(`Failed to GET activity state: ${ex}`);
    });
};

CoursePlugin.prototype.setActivityState = function (stateId, data) {
  return fetch(
    this.getEndpoint() +
      "activities/state?" +
      new URLSearchParams({
        stateId: stateId,
        activityId: this.cmi5.getActivityId(),
        agent: JSON.stringify(this.cmi5.getActor()),
        registraction: this.cmi5.getRegistration(),
      }),
    {
      mode: "cors",
      method: "put",
      headers: {
        "X-Experience-API-Version": XAPI_VERSION,
        Authorization: this.cmi5.getAuth(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  )
    .then((response) => {
      if (response.status === 200) {
        return response.json();
      }
      return Promise.resolve("");
    })
    .catch((ex) => {
      throw new Error(`Failed to GET activity state: ${ex}`);
    });
};

CoursePlugin.prototype.getBookmark = function () {
  return this.getActivityState(SUSPEND_DATA_KEY).then((bookmarkObj) => {
    if (bookmarkObj && bookmarkObj["bookmark"]) {
      return Promise.resolve(bookmarkObj["bookmark"]);
    } else {
      return Promise.resoleve("");
    }
  });
};

CoursePlugin.prototype.setBookmark = function (bookmark) {
  return this.setActivityState(SUSPEND_DATA_KEY, { bookmark: bookmark });
};

CoursePlugin.prototype.getOverridePassingScaledScore = function () {
  return this.passingScore;
};

CoursePlugin.prototype.fail = function (userScoreObj) {
  if (!this.cmi5) {
    return Promise.resolve(null);
  }

  if (this._shouldSendStatement()) {
    return this.cmi5.failed(userScoreObj);
  }
  return Promise.resolve(null);
};

CoursePlugin.prototype.passAndComplete = function (userScoreObj) {
  if (!this.cmi5) {
    return Promise.resolve(null);
  }

  if (this._shouldSendStatement()) {
    return this._sendStatementViaLibFunction(() => {
      return this.cmi5.passed(userScoreObj).then(() => this.cmi5.completed());
    });
  }
  return Promise.resolve(null);
};

CoursePlugin.prototype._exitRedirect = function () {
  if (this.cmi5 && this.cmi5.getReturnURL()) {
    document.location.href = this.cmi5.getReturnURL();
  }
};

CoursePlugin.prototype._exit = function () {
  if (window.opener) {
    try {
      window.close();
    } catch (e) {
      this._exitRedirect();
    }
  } else {
    this._exitRedirect();
  }
};

CoursePlugin.prototype.exit = function (alreadyAttempted) {
  if (this.cmi5 && !alreadyAttempted) {
    this.cmi5.terminate().finally(() => {
      this._exit();
    });
  } else {
    this._exit();
  }
};

CoursePlugin.prototype.experienced = function (pageId, name, overallProgress) {
  if (!this.cmi5) {
    return Promise.resolve(null);
  }

  let stmt = this.cmi5.prepareStatement(VERB_EXPERIENCED_OBJ.id);
  stmt.verb.display = VERB_EXPERIENCED_OBJ.display;
  stmt.object = {
    objectType: "Activity",
    //{#NOTES} CHECK IF THIS IS STANDARD OR COURSE SPECIFIC
    id: this.cmi5.getActivityId() + "/slide/" + pageId,
    definition: {
      name: { "en-US": name },
    },
  };

  // If we can, also save the progress value, ignore values that are out of range.
  if (
    !Number.isNaN(overallProgress) &&
    overallProgress > 0 &&
    overallProgress < 100
  ) {
    if (!stmt.result) {
      stmt.result = {};
    }
    if (!stmt.result.extensions) {
      stmt.result.extensions = {};
    }
    stmt.result.extensions[
      "https://w3id.org/xapi/cmi5/result/extensions/progress"
    ] = Math.round(overallProgress);
  }
  return this.sendStatement(stmt);
};


