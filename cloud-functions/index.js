const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.dayLoop = functions.https.onRequest((req, res) => {

	var day = 0;
	//  update day
	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Day').transaction(function(currentValue) {

		day = currentValue + 1;

		if (day >= 7) {
			// update rain amount
			RainAmount(6);
			return 0;
		}
		else {
			// update rain amount
			RainAmount(6 - day);
			return day;
		}

	});

});

exports.waterMins = functions.database.ref('/Users/{uid}/RainAmount').onWrite((change, context) => {

	var rainAmount = change.after.val();
	var day = 0;
	var lawn = 0;
	var flowRate = 0;

	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455').once('value').then(function(snapshot) {
		day = snapshot.child('Day').val();
		lawn = snapshot.child('Lawn').val();
		flowRate = snapshot.child('FlowRate').val();

		var totalWaterMins = WaterCap(7-day, flowRate, lawn, rainAmount);

		//admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/WaterMins').set(WaterCap(7 - day, flowRate, lawn, rainAmount));

		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/WaterMins').transaction(function(currentValue) {
				return parseFloat(totalWaterMins).toPrecision(5);
			});
		

		return null;
	}).catch(error => {
		console.error(error);
		res.error(500);
	});

	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455').once('value').then(function(snapshot) {
		var skipped = snapshot.child('Skipped').val();
		
		if (skipped === false) {
			StartTime(0);
		}
		else {
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Skipped').set(false);
		}

		return null;
	}).catch(error => {
		console.error(error);
		res.error(500);
	});
	

});


// @param days days left in the week
// @return total millimeters of expected rain for the days left in the week
function RainAmount(days) {

	// cap precipitation probability at 50%
	const PRECIP_PROBAB_CAP = 0.5;

	// total millimeters of expected rain
	var totalMil = 0.0;

	// weather api
	var request = require("request");		
	var url = "https://api.darksky.net/forecast/18c73f961f7ad545747b86018b67a4b9/39.952219,-75.193214?exclude=minutely,currently,daily,alerts,flags&extend=hourly";
	request({url: url, json: true}, function (error, response, body) {
	    if (!error && response.statusCode === 200) {
	        
	        var rainArray = body.hourly.data;

	        var rainToday = 0

	        for (var j = 0; j < 24; j++) {
	        	if (rainArray[j].precipProbability > PRECIP_PROBAB_CAP) {
	        		rainToday += rainArray[j].precipIntensity
	        	}
	        }

	        admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/RainToday').set(rainToday);

			for (var i = 0; i < rainArray.length; i++) {
				// if hours iterated is bigger than days left in the week
				if ((i / 24) > days) {
						break;
					}
				if (rainArray[i].precipProbability > PRECIP_PROBAB_CAP) {
					totalMil += rainArray[i].precipIntensity
				}
			}

			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/RainAmount').transaction(function(currentValue) {
				return parseFloat(totalMil).toPrecision(5);
			});

	    }

	});

}

// @param days days left in the week
// @return gallons of water 
function WaterCap(days, flowRate, lawn, rainAmount) {

	// conventional gallons per 1 sqft or 1 inch of water
	const GAL_PER_SQFT = 0.62;

	// millimeters to inch convert
	const MIL_INCH_CONVERT = 0.04;
	
	// calculate gallons of rain
	var rainGal = rainAmount * MIL_INCH_CONVERT * GAL_PER_SQFT;

	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Gallons').transaction(function(currentValue) {
				return currentValue + rainGal
	});

	var totalWater = (GAL_PER_SQFT - rainGal) * lawn;

	var totalMins = totalWater/flowRate;

	return parseFloat((totalMins/(days+1)).toPrecision(5));

}


function StartTime(time) {

	const MAX_WIND = 20;
	const MAX_TEMP = 33;
	const MIN_TEMP = 0;
	const PRECIP_PROBAB_CAP = 0.7;

	// divide into even intervals
	// check min windspeed & min temp and account for total length
	var request = require("request");

	var url = "";

	if (time === 0) {
		url = "https://api.darksky.net/forecast/18c73f961f7ad545747b86018b67a4b9/39.952219,-75.193214?exclude=minutely,currently,daily,alerts,flags";
	}
	else {
		url = "https://api.darksky.net/forecast/18c73f961f7ad545747b86018b67a4b9/39.952219,-75.193214,"+time+"?exclude=minutely,currently,daily,alerts,flags";
	}

	request({url: url, json: true}, function (error, response, body) {
	    if (!error && response.statusCode === 200) {
	        
	        var hourly = body.hourly.data;

	        // check rain skip

	        for (var i = 0; i < 24; i++) {
	        	if (hourly[i].precipProbability > PRECIP_PROBAB_CAP || hourly[i].windSpeed > MAX_WIND || hourly[i].temperature > MAX_TEMP || hourly[i].temperature < MIN_TEMP) {
	        		returnHour = -1;
	        		break;
	        	}
	        }

    		// composite score of windspeed + temp
    		var minScore = hourly[3].windSpeed + hourly[3].temperature;

    		var returnHour = 3;

    		for (var j = 4; j < 7; j++) {
    			if (hourly[j].windSpeed + hourly[j].temperature < minScore) {
    				minScore = hourly[j].windSpeed + hourly[j].temperature;
    			}
    		}
    		for (var k = 4; k < 7; k++) {
    			if (hourly[k].windSpeed + hourly[k].temperature === minScore) {
    				returnHour = k;
    			}
    		}

    		// backup

    		// var minBackup = hourly[15].windSpeed + hourly[15].temperature;

    		// var returnHourBackup = 15;


    		// for (var l = 16; l < 18; l++) {
    		// 	if (hourly[l].windSpeed + hourly[l].temperature < minBackup) {
    		// 		minBackup = hourly[l].windSpeed + hourly[l].tempereature;
    		// 	}
    		// }
    		// for (var p = 16; p < 18; p++) {
    		// 	if (hourly[p].windSpeed + hourly[p].temperature === minBackup) {
    		// 		returnHourBackup = p;
    		// 	}
    		// }
    		

			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/NextStart').transaction(function(currentValue) {
				return returnHour * 3600;
			});

			// admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/NextStartBackup').transaction(function(currentValue) {
			// 	return returnHourBackup * 3600;
			// });			

	    }

	});
}

exports.moisture = functions.database.ref('/Users/{uid}/Moisture').onWrite((change, context) => {

	const OVER_MOIST = 80;
	const CRIT = 10;
	const BUFFER = 20;

	var moist = change.after.val();

	if (moist <= CRIT) {

		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/CritStart').set(true);
		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/CritStart').set(9);

	}

	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455').once('value').then(function(snapshot) {
		var critStart = snapshot.child('CritStart').val();
		var start = snapshot.child('Start').val();
		var auto = snapshot.child('Auto').val();

		if (critStart === true && moist >= BUFFER) {
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/CritStart').set(false);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/CritStart').set(0);
			dmin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Start').set(false);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/Start').set(0);
		}
		else if (start === true && moist >= OVER_MOIST) {
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Start').set(false);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/Start').set(0);
			if (auto === true) {
				admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Auto').set(false);
			}
		}
		else if (start === false && moist >= OVER_MOIST) {

			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/NextStart').set(-1);

		}

		return null;
	}).catch(error => {
		console.error(error);
		res.error(500);
	});

});

exports.pause = functions.database.ref('/Users/{uid}/Start').onWrite((change, context) => {

	if (change.after.val() === true) {
		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/OnPause').set(false);
	}

	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455').once('value').then(function(snapshot) {
			
		var nextStart = snapshot.child('NextStart').val();
		var waterMins = snapshot.child('WaterMins').val();
		var time = snapshot.child('Time').val();

		var endTime = nextStart + (waterMins * 60);

		if (time < endTime && time > nextStart) {
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/TimeRemaining').set(endTime - time);
			if (change.after.val() === false) {
				admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/OnPause').set(true);
			}
		}
		return null;
	}).catch(error => {
		console.error(error);
		res.error(500);
	});
	
});

exports.skip = functions.database.ref('/Users/{uid}/NextStart').onWrite((change, context) => {
	if (change.after.val() === -1) {
		var date = Date.now();
		date = Math.trunc(date/1000);

		StartTime(date + 24*60*60);

		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Skipped').set(true);
	}
});


exports.updateTime = functions.https.onRequest((req, res) => {

	
	var date = new Date(Date.now());

	var hours = date.getHours() - 4;

	if (hours < 0) {
		hours += 24;
	}

	var sec = (hours)*3600 + date.getMinutes()*60 + date.getSeconds();

	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Time').set(sec);


});

exports.auto = functions.database.ref('/Users/{uid}/Time').onWrite((change, context) => {
	
	admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455').once('value').then(function(snapshot) {
			
		var nextStart = snapshot.child('NextStart').val();
		var skipped = snapshot.child('Skipped').val();
		var waterMins = snapshot.child('WaterMins').val();
		var paused = snapshot.child('OnPause').val();
		var auto = snapshot.child('Auto').val();

		var time = change.after.val();

		var endTime = nextStart + (waterMins * 60);

		if (skipped === false && time >= nextStart && time < endTime && paused === false) {
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/TimeRemaining').set(endTime - time);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Start').set(true);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/Start').set(9);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Auto').set(true);
		}
		else if (auto === true && time > endTime) {
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Start').set(false);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/Start').set(0);
			admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Auto').set(false);
		}
		
		return null;
	}).catch(error => {
		console.error(error);
		res.error(500);
	});


});

// exports.arduinoStart = functions.database.ref('/Users/{uid}/Start').onWrite((change, context) => {
	
// 	if (change.after.val() === true) {
// 		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/Start').set(9);
// 	}
// 	else {
// 		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/Start').set(0);
// 	}

// });

// exports.arduinoCritStart = functions.database.ref('/Users/{uid}/CritStart').onWrite((change, context) => {
	
// 	if (change.after.val() === true) {
// 		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/CritStart').set(9);
// 	}
// 	else {
// 		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/CritStart').set(0);
// 	}

// });

exports.logs = functions.database.ref('/Users/{uid}/Arduino/Start').onWrite((change, context) => {

	if (change.after.val() === 9) {
		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/').once('value').then(function(snapshot) {
			
		var time = snapshot.child('Time').val();
		var uid = snapshot.child('Logs/UID').val();

		uid = uid + 1

		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Logs/'+ uid + '/Start').set(time);
		admin.database().ref('/Users/176f6210-1524-420b-92ce-7115dcaf0455/Logs/UID').set(uid);
		
		return null;
	}).catch(error => {
		console.error(error);
		res.error(500);
	});
	}
	
});


