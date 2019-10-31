#include <ESP8266WiFi.h>
#include <NTPtimeESP.h>
#include <FirebaseArduino.h>

#define FIREBASE_HOST "elephant-d9b76.firebaseio.com"
#define FIREBASE_AUTH "YpJfgYLLsuoCIimK4TWBcYleF7Z0w1V35GB1uHto"
#define WIFI_SSID "AirPennNet-Device"
#define WIFI_PASSWORD "penn1740wifi"

NTPtime NTPch("us.pool.ntp.org");

// moisture sensor pin
const int sensor_pin = A0;

// solenoids output pin
const int output_pin = 4;

const int HOUR_DELAY = 3600 * 1000;
const int TEN_SEC_DELAY = 10 * 1000;
const int FIVE_SEC_DELAY = 5 * 1000;

// variable delay
int var_delay = HOUR_DELAY;

unsigned long time_now = 0;

void setup() {
  Serial.begin(9600);

  // connect to wifi.
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("connecting");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();
  Serial.print("connected: ");
  Serial.println(WiFi.localIP());
  
  Firebase.begin(FIREBASE_HOST, FIREBASE_AUTH);
}

void loop() {

  
  if (Firebase.getInt("Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/CritStart") == 9) {
    Serial.println("detected critstart");
    digitalWrite(output_pin, HIGH);
    var_delay = FIVE_SEC_DELAY;
  }
  else if (Firebase.getInt("Users/176f6210-1524-420b-92ce-7115dcaf0455/Arduino/Start") == 9) {
    Serial.println("detected start");
    digitalWrite(output_pin, HIGH);
    var_delay = TEN_SEC_DELAY;
  }
  else {
    Serial.println("LOW");
    digitalWrite(output_pin, LOW);
    var_delay = HOUR_DELAY;
  }

  if (millis() > time_now + var_delay) {
    time_now = millis();

    switch (var_delay) {
      case HOUR_DELAY: 
        hourly();
        break;
      case TEN_SEC_DELAY:
        start();
        break;
      case FIVE_SEC_DELAY:
        critStart();
        break;
      default:
        break;
    }
    
  }
  
  delay(2000);
  
}

void hourly() {

  Serial.println("hourly");

  moisture();

}


void start() {

  Serial.println("start");

  moisture();

}

void critStart() {

  Serial.println("critStart");
  
  moisture();
}

void moisture() {

  const double VOLTAGE_CONVERSION = 2.74;

  const int DRY_VAL = 670;
  const int WET_VAL = 450;

  const int TIMES = 10;

  int output_value = 0;

  int total = 0;

  for (int i = 0; i < TIMES; i++) {

    output_value = analogRead(sensor_pin);
    
    output_value *= VOLTAGE_CONVERSION;

    if (output_value < WET_VAL) {
      output_value = WET_VAL;
    }
    else if (output_value > DRY_VAL) {
      output_value = DRY_VAL;
    }

    total += output_value;

    delay(300);
    
  }

   output_value = total / TIMES;

   output_value = map(output_value,DRY_VAL,WET_VAL,0,100);

   Firebase.setInt("Users/176f6210-1524-420b-92ce-7115dcaf0455/Moisture", output_value);

   Serial.println(output_value);

}
