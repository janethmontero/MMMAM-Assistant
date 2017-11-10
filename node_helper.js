'use strict'

const Sound = require('node-aplay')
const path = require('path')
const fs = require('fs')
const record = require('node-record-lpcm16')
const Detector = require('snowboy').Detector
const Models = require('snowboy').Models
const Speaker = require('speaker')
const GoogleAssistant = require('google-assistant')
const Speech = require('@google-cloud/speech')
const exec = require('child_process').exec
//const tts = require('picotts')

var NodeHelper = require("node_helper")

module.exports = NodeHelper.create({
  start: function () {
    this.config = {}
    this.status = 'NOTACTIVATED'
    this.commandAuthIndex = 0
    this.commandAuthMax = 0
    this.pause = new Set()
  },

  initialize: function (config) {
    this.config = config

    this.config.assistant.auth.keyFilePath
      = path.resolve(__dirname, this.config.assistant.auth.keyFilePath)
    this.config.assistant.auth.savedTokensPath
      = path.resolve(__dirname, this.config.assistant.auth.savedTokensPath)

    this.commandAuthMax = this.config.stt.auth.length
    for(var i=0; i<this.commandAuthMax; i++) {
      this.config.stt.auth[i].keyFilename
        = path.resolve(__dirname, this.config.stt.auth[i].keyFilename)
    }


    this.sendSocketNotification('MODE', {mode:"INITIALIZED"})
  },

  socketNotificationReceived: function (notification, payload) {
    switch(notification) {
      case 'PAUSE':
        this.pause.add(payload)
        //if (this.pause.size > 0) this.sendSocketNotification('PAUSED')
        break
      case 'RESUME':
        this.pause.delete(payload)
        if (this.pause.size == 0) this.sendSocketNotification('RESUMED')
        break
      case 'CONFIG':
        this.initialize(payload)
        this.status = 'READY'
        break
      case 'HOTWORD_STANDBY':
        if(this.status !== 'HOTWORD_STANDBY') {
          this.status = 'HOTWORD_STANDBY'
          if(this.pause.size == 0) this.activateHotword()
        }
        break
      case 'ACTIVATE_ASSISTANT':
        if (this.status !== 'ACTIVATE_ASSISTANT') {
          this.status = 'ACTIVATE_ASSISTANT'
          if(this.pause.size == 0) this.activateAssistant('ASSISTANT')
        }
        break
      case 'ACTIVATE_COMMAND':
        if (this.status !== 'ACTIVATE_COMMAND') {
          this.status = 'ACTIVATE_COMMAND'
          if(this.config.system.commandRecognition == 'google-cloud-speech') {
            if(this.pause.size == 0){
              this.activateCommand()
              console.log("AQUIII");
            } else{
              console.log("OOO AQUII");
            }
          } else if (this.config.system.commandRecognition == 'google-assistant') {
            console.log("NOOOO");
            if(this.pause.size == 0){
              this.activateAssistant('COMMAND')
              console.log("MENOOS");
            }
          }

        }else{
          console.log("MAYBE NO ENTRE =/");
        }
        break

      case 'SPEAK':
        if (this.status !== 'ACTIVATE_SPEAK') {
          this.status = 'ACTIVATE_SPEAK'
          console.log(payload)
          if(this.pause.size == 0) this.activateSpeak(payload.text, payload.option, payload.originalCommand)
        }
        break
      case 'REBOOT':
        execute('sudo reboot now', function(callback){
          console.log(callback)
        })
        break
      case 'SHUTDOWN':
        execute('sudo shutdown -t 1', function(callback){
          console.log(callback)
        })
        break
      case 'TEST':
        this.test(payload)
        break
    }
  },
  test: function(test) {
    this.sendSocketNotification('COMMAND', test)
  },

  activateSpeak: function(text, commandOption={}, originalCommand = "") {
    var option = {}
    option.language = (typeof commandOption.language !== 'undefined') ? commandOption.language : this.config.speak.language
    option.useAlert = (typeof commandOption.useAlert !== 'undefined') ? commandOption.useAlert : this.config.speak.useAlert
    option.originalCommand = (originalCommand) ? originalCommand : ""
    var commandTmpl = 'pico2wave -l "{{lang}}" -w {{file}} "{{text}}" && aplay {{file}}'

    function getTmpFile() {
    	var random = Math.random().toString(36).slice(2),
    		path = '/tmp/' + random + '.wav'
    	return (!fs.existsSync(path)) ? path : getTmpFile()
    }

    function say(text, lang, cb) {
      text = (text) ? text.trim() : ""
      text = text.replace(/<[^>]*>/g, "")
      text = text.replace(/\"/g, "'")
      text = text.trim()

    	var file = getTmpFile(),
    		command = commandTmpl.replace('{{lang}}', lang).replace('{{text}}', text).replace(/\{\{file\}\}/g, file)
    	  exec(command, function(err) {
    		cb && cb(err)
    		fs.unlink(file, ()=>{})
    	})
    }

    this.sendSocketNotification('MODE', {mode:'SPEAK_STARTED', useAlert:option.useAlert, originalCommand:option.originalCommand, text:text})
    say(text, option.language, (err) => {
      if (!err) {
        console.log("[ASSTNT] Speak: ", text)
        this.sendSocketNotification('MODE', {mode:'SPEAK_ENDED', useAlert:option.useAlert})
        if (this.pause.size > 0) {
          this.sendSocketNotification('PAUSED')
        }
      } else {
        console.log("[ASSTNT] Speak Error", err)
      }
    })
  },
  
  activateHotword: function() {
    console.log('[ASSTNT] Snowboy Activated')
    this.sendSocketNotification('MODE', {mode:'HOTWORD_STARTED'})
    new Sound(path.resolve(__dirname, 'resources/ding.wav')).play();
    var models = new Models();
    this.config.snowboy.models.forEach((model)=>{
      model.file = path.resolve(__dirname, model.file)
      models.add(model)
    })
    var mic = record.start(this.config.record)

    var detector = new Detector({
      resource: path.resolve(__dirname, "resources/common.res"),
      models: models,
      audioGain: 2.0
    })
    detector.on('silence', ()=>{
      if (this.pause.size > 0) {
        record.stop()
        this.sendSocketNotification('PAUSED')
        console.log("ASSISTENT 111111111");
        return
      }
    })
    detector.on('sound', (buffer)=>{
      if (this.pause.size > 0) {
        record.stop()
        this.sendSocketNotification('PAUSED')
        console.log("ASSISTENT 222222222");
        return
      }
    })

    detector.on('error', (err)=>{
      console.log('[ASSTNT] Detector Error', err)
      record.stop()
      this.sendSocketNotification('ERROR', 'DETECTOR')
      console.log("ASSISTENT 33333333");
      return
    })

    detector.on('hotword', (index, hotword, buffer)=>{
      record.stop()
      new Sound(path.resolve(__dirname, 'resources/dong.wav')).play()
      this.sendSocketNotification('HOTWORD_DETECTED', hotword)
      this.sendSocketNotification('MODE', {mode:'HOTWORD_DETECTED'})
      console.log("ASSISTENT 444444444");
      if (this.pause.size > 0){
        console.log("ASSISTENT 555555555");
         this.sendSocketNotification('PAUSED')

      }
      return
    })

    mic.pipe(detector);
  },

  activateCommand: function() {
    console.log("111111");
    this.sendSocketNotification('MODE', {mode:'COMMAND_STARTED'})
    const speech = Speech(this.config.stt.auth[this.commandAuthIndex++])
    if (this.commandAuthIndex >= this.commandAuthMax) this.commandAuthIndex = 0

    const request = {
      config: this.config.stt.request,
      interimResults: false // If you want interim results, set this to true
    }
    const recognizeStream = speech.streamingRecognize(request)
      .on('error', (err)=>{
        console.log('[ASSTNT] RecognizeStream Error: ', err)
        record.stop()
        this.sendSocketNotification('ERROR', 'RECOGNIZESTREAM')
      })
      .on('data', (data) => {
        this.sendSocketNotification('MODE', {mode:'COMMAND_LISTENED'})
        if ((data.results[0] && data.results[0].alternatives[0])) {
          console.log(
            "[ASSTNT] Command recognized:",
            data.results[0].alternatives[0].transcript
          )
          this.sendSocketNotification(
            'COMMAND',
            data.results[0].alternatives[0].transcript
          )
          record.stop()
        }
        if (this.pause.size > 0) {
          record.stop()
          this.sendSocketNotification('PAUSED')
          console.log("---SI ENTRO AQUI, ES DONDE SE PAUSEA Y SE PONE ROJO??")
        }
      })

  // Start recording and send the microphone input to the Speech API
    record
      .start(this.config.record)
      .on('error', (err)=>{
        console.log("[ASSTNT] Recording Error: ",err)
        record.stop()
        this.sendSocketNotification('ERROR', 'RECORD ERROR')
        console.log("O AQUI SE TRABA??");
      })
      .pipe(recognizeStream);
  }
})

function execute(command, callback){
  exec(command, function(error, stdout, stderr){ callback(stdout); });
}
