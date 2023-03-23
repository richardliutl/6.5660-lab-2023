import * as grading from "./grading.mjs";
var fs = grading.fs;
var webpage = grading.webpage;
var system = grading.system;
var phantom = grading.phantom;

function findUrl(answerPath) {
    // People put random text. Find the first line that starts with
    // the right thing. open().readLine() would be nice, except their
    // API can't actually distinguish empty lines from EOF.
    var answerLines = fs.read(answerPath).split('\n');
    var prefix = "http://localhost:8080/zoobar/index.cgi/users?";
    var urls = answerLines.filter(function(url) {
        return url.substr(0, prefix.length) == prefix;
    });
    // Some students put the intended URL first and the unencoded or
    // (in one case) development URL second. Some in the other
    // order. Prefer the one with more %s. If a tie, prefer the
    // earlier.
    //
    // TODO(davidben): Ask students to place the URL in the first line
    // or something next year and make this less complicated.
    var bestUrl = undefined;
    var bestCount = -1;
    urls.forEach(function(url) {
        var m = url.match(/%/g);
        if (!m) return;
        var count = m.length;
        if (count > bestCount) {
            bestCount = count;
            bestUrl = url;
        }
    });
    return bestUrl;
}

async function main(studentDir) {
    if (studentDir === undefined) {
        console.log("USAGE: node " + system.args[0] + " student_dir/");
        phantom.exit();
        return;
    }
    var answerPath = studentDir + "/answer-3.txt";

    if (!fs.isFile(answerPath)) {
        grading.failed("No answer-3.txt");
        phantom.exit();
        return;
    }

    var url = findUrl(answerPath);
    if (url === undefined) {
        console.log("Could not find URL. Please ensure your URL is the first line of answer-3.txt.");
        phantom.exit();
        return;
    }
    console.log("Found URL: " + url);

    grading.registerTimeout();

    // First login.
    await grading.initUsers(async function(auth) {
        await phantom.setCookies(auth.graderCookies);

        // Print out the cookie we expect.
        var correctCookie = await grading.getCookie("localhost", "PyZoobarLogin");

        console.log("Expecting cookie: " + correctCookie);

        // Now make a new page and open the attacker's URL.
        var page = await webpage.create();

        var finished = false;

        page.onAlert = async function(dialog) {
            const content = dialog.message();
            const msg = "alert contains: " + correctCookie;
            if (content.indexOf(correctCookie) > -1) {
              grading.passed(msg);
            } else {
              grading.failed(msg);
            }
            finished = true;
            await dialog.dismiss();
        };


        await grading.openOrDie(page, url, async function() {
            // Wait 1s for any JS to settle and take a picture.
            setTimeout(async function () {
                await grading.derandomize(page);

                //make sure we show the fail message if no alert was triggered
                if (finished == false) {
                    grading.failed("Timeout, no alert was triggered")
                }

                phantom.exit();
            }, 1000);
        });
    });
}

await main.apply(null, system.args.slice(1));
