function Test(opts) {
     window.addEventListener("beforeunload", event => {
        this.exit({isUnloading: true});
    });

    this.questionList = [];
    
    if (opts.questionList) {
        this.questionList = opts.questionList;
    } else if (opts.questionListQueryParam) {
        this.questionList = opts.questionListQueryParam.split(",");
    } else {
        let tempQuestions = document.getElementsByClassName("contentquestion");
        this.questionList = [];
        for (let i=0; i <tempPages.length; i++)
    }
}