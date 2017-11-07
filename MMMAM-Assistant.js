/* Magic Mirror
 * Module: MMMAM-Assistant
 *
 */
if (String.prototype.toRegExp !== 'undefined') {
  String.prototype.toRegExp = function() {
    var lastSlash = this.lastIndexOf("/")
    if(lastSlash > 1) {
      var restoredRegex = new RegExp(
        this.slice(1, lastSlash),
        this.slice(lastSlash + 1)
      )
      return (restoredRegex) ? restoredRegex : new RegExp(this.valueOf())
    } else {
      return new RegExp(this.valueOf())
    }
  }
}


Module.register("MMMAM-Assistant", {
  defaults: {
    system: {
      readAlert : true, // reserved for later
      commandRecognition: 'google-cloud-speech', //'google-assistant' (reserved for later)
      commandSpeak: 'pico', //google-translate (reserved for later)
    },
    assistant: {
      auth: {
        keyFilePath: "secret.json",
        savedTokensPath: "resources/tokens.js"
      },
      audio: {
        encodingIn: "LINEAR16",
        sampleRateOut: 16000
      }
    },
    snowboy: {
      models: [
        {
          file: "resources/oye Emma.pmdl",
          sensitivity: 0.5,
          hotwords : "EMMA"
        },
        /*{
          file: "resources/snowboy.pmdl",
          sensitivity: 0.5,
          hotwords : "ASSISTANT"
        }*/
      ]
    },
    record: {
      threshold: 0,
      verbose:false,
      recordProgram: 'arecord',
      silence: 2.0
    },
    stt: {
      auth: [{
        projectId: '', //ProjectId from Google Console
        keyFilename: ''
      }],
      request: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'es-MX' //See https://cloud.google.com/speech/docs/languages
      },
    },
    speak: {
      useAlert: true,
      language: 'es-ES',
    },
    alias: [
      {
        "help :command" : ["teach me :command", "what is :command"]
      }
    ],
    speechCurrentWeather: '',
    speechMedicalAlert: '',
    speechNextAlert: '',
    speechDetailsNextAlert: ''
  },

  start: function() {
    console.log("[ASSTNT] started!")
    this.commands = []
    this.status = "START"
    this.config = this.configAssignment({}, this.defaults, this.config)
    this.getCommands(
      new AssistantCommandRegister(this, this.registerCommand.bind(this))
    )

    this.isAlreadyInitialized = 0
    this.sendSocketNotification('CONFIG', this.config)
  },

  getTranslations: function() {
    return {
      en: "translations/en.json",
      es: "translations/es.json"
    }
  },

  getStyles: function () {
    return ["MMM-Assistant.css","font-awesome.css"]
  },

  getCommands : function(Register) {
    if (Register.constructor.name == 'TelegramBotCommandRegister') {
      //do nothing
    }
    if (Register.constructor.name == 'AssistantCommandRegister') {
      var commands = [
        {
          command: 'Dime el clima',
          callback : 'cmd_sayTheWeather',
          description : "Puedes saber el clima con este comando.",
        },
        {
          command: 'oculta el mensaje',
          callback : 'cmd_hideMedicalAlert',
          description : "Oculta las alertas mostradas en pantalla, en caso de que halla una.",
        },
        {
          command: 'Lee la alerta médica',
          callback : 'cmd_SayMedicalAlert',
          description : "Lee la alerta médica.",
        },
        {
          command: 'Dime el siguiente medicamento',
          callback : 'cmd_SayNextAlert',
          description : "Da informacion de la siguiente toma y dice cuanto falta para ella.",
        },
        {
          command: 'Dime el detalle del siguiente medicamento',
          callback : 'cmd_SayDetailNextAlert',
          description : "Da informacion de la siguiente toma, cuanto falta para ella y la descripcion.",
        },
        {
          command: 'actualiza la lista de medicamentos',
          callback : 'cmd_updateMedicalList',
          description : "Actualiza el calendario de medicamentos.",
        },
      ]
      commands.forEach((c) => {
        Register.add(c)
      })
    }
  },

  cmd_sayTheWeather : function(command, handler) {

    var option = {
      language: 'es-ES',
      useAlert: false
    }
    handler.reply('TEXT', speechCurrentWeather, option)
  },

  cmd_hideMedicalAlert: function(command, handler) {
    this.sendNotification("CALENDAR_HIDE_MEDICAL_ALERT");
    this.sendNotification("HIDE_ALERT");
    //handler.response("Muy bien!");
    var option = {
      language: 'es-ES',
      useAlert: false
    }
    handler.reply("TEXT","Entendido!", option)
  },

  cmd_SayNextAlert: function(command, handler) {
    this.sendNotification("TIME_TO_NEXT");
  },

  cmd_SayDetailNextAlert: function(command, handler) {
    this.sendNotification("SHOW_DETAIL_NEXT");
  },

  cmd_SayMedicalAlert(command){

    var option = {
      language: 'es-ES',
      useAlert: false
    };
    var callbacks = {
      response: this.response.bind(this)
    };
    var handler = new AssistantHandler ({text: "lee la alerta médica"}, speechMedicalAlert, callbacks);
    //this.sendNotification("SHOW_DETAIL_NEXT");
    //this.sendNotification("ASSISTANT_REQUEST_PAUSE");//BORRAR ESTA
    handler.reply("TEXT",speechMedicalAlert, option);
  },

  cmd_asstnt_say : function (command, handler) {
    var option = {
      language: 'es-ES',
      useAlert: false
    }
    handler.reply("TEXT", handler.args.something, option)
  },

  cmd_updateMedicalList: function (command, handler) {
    this.sendNotification("UPDATE_CALENDAR_LIST");
    var option = {
      language: 'es-ES',
      useAlert: false
    }
    handler.reply("TEXT", "Entendido!", option)
  },

  registerCommand: function(module, commandObj) {
    var c = commandObj
    var command = c.command.replace(/\([^\s]*\)/g, "")
    var moduleName = module.name

    var callback = ((c.callback) ? (c.callback) : 'notificationReceived')
    if (typeof module[callback] !== 'function') return false
    var isNameUsed = 0
    var idx = 0
    for (var j in this.commands) {
      var sameCommand = this.commands.filter(function(com) {
        if (com.command == command) return com
      })
      if (sameCommand.length > 0) {
        isNameUsed = 1
        command = c.command + idx
        idx++
      } else {
        isNameUsed = 0
      }
    }
    if (isNameUsed == 1) return false
    var cObj = {
      command : command,
      execute : c.command,
      moduleName : module.name,
      module : module,
      description: c.description,
      callback : callback,
    }
    this.commands.push(cObj)

    if (this.config.alias[command]) {
      var alias = this.config.alias[command]
      alias.forEach((ac)=>{
        var cObj = {
          command : ac.replace(/\([^\s]*\)/g, ""),
          execute : ac,
          moduleName : module.name,
          module : module,
          description: c.description + this.translate("ALIAS", {"command":command}),
          callback : callback,
        }
        this.commands.push(cObj)
      })
    }
    return true
  },

  getDom : function() {
    var wrapper = document.createElement("div")
    wrapper.className = "ASSTNT"
    var iconDom = document.createElement("div")
    iconDom.className = "mdi status " + this.status + " "
    switch(this.status) {
      case 'INITIALIZED':
        iconDom.className += "mdi-microphone-outline"
        break
      case 'HOTWORD_STARTED':
        iconDom.className += "mdi-microphone"
        break
      case 'HOTWORD_DETECTED': /*Habla*/
        iconDom.className += "mdi-microphone"
        break
      case 'ASSISTANT_STARTED':
        iconDom.className += "mdi-google-assistant"
        break
      case 'ASSISTANT_SPEAKING':
        iconDom.className += "mdi-google-assistant"
        break
      case 'COMMAND_STARTED':
        iconDom.className += "mdi-apple-keyboard-command"
        break
      case 'COMMAND_LISTENED':
        iconDom.className += "mdi-apple-keyboard-command"
        break
      case 'SPEAK_STARTED':
        iconDom.className += "mdi-message-processing"
        break
      case 'SPEAK_ENDED':
        iconDom.className += "mdi-microphone"
        break
    }

    iconDom.innerHTML = ""
    wrapper.appendChild(iconDom)
    return wrapper
  },

  notificationReceived: function (notification, payload, sender) {
    console.log("NOTIFICACION RECIBIDA: "+notification);
    switch(notification) {

      case 'MEDICAL_ALERT_DATA':
        speechMedicalAlert = payload
        console.log(speechMedicalAlert)
        this.cmd_SayMedicalAlert("lee la alerta médica")

        break

      case 'CURRENTWEATHER_DATA':
        //console.log(sender)
        speechCurrentWeather = 'El clima actual es de ' + sender.temperature + ' grados '
        if (sender.config.units === "metric") speechCurrentWeather += 'centígrados'
        else if (sender.config.units ==="imperial") speechCurrentWeather += 'fahrenheit'
        else if (sender.config.units === "default") speechCurrentWeather += 'kelvin'

        console.log(speechCurrentWeather);
        break
        //DE AQUI HACIA ARRIBA ESTAN LAS NOTIFICACIONES DE MEDICAL ALERT
      case 'ASSISTANT_REQUEST_PAUSE':
        this.sendSocketNotification('PAUSE', sender.name)
        break
      case 'ASSISTANT_REQUEST_RESUME':
        this.sendSocketNotification('RESUME', sender.name)
        break
      case 'ALL_MODULES_STARTED':
        if (this.isAlreadyInitialized) {
          return
        }
        this.isAlreadyInitialized = 1
        this.loadCSS()
        var commands = []
        MM.getModules().enumerate((m) => {
          if (m.name !== 'MMMAM-Assistant') {
            if (typeof m.getCommands == 'function') {
              var tc = m.getCommands(new AssistantCommandRegister(
                m,
                this.registerCommand.bind(this)
              ))
              if (Array.isArray(tc)) {
                tc.forEach((c)=>{
                  this.registerCommand(m, c)
                })
              }
            }
          }
        })

        this.sendSocketNotification('HOTWORD_STANDBY')
        break;
    }
  },

  socketNotificationReceived: function (notification, payload) {
    switch(notification) {
      case 'PAUSED':
        this.status == 'PAUSED'
        this.updateDom()
        this.sendNotification('ASSISTANT_PAUSED')
        break;
      case 'RESUMED':
        this.status == 'HOTWORD_STANDBY'
        this.sendSocketNotification("HOTWORD_STANDBY")
        this.sendNotification('ASSISTANT_RESUMED')
        break;
      case 'HOTWORD_DETECTED':
        this.status = "HOTWORD_DETECTED"
        console.log("[ASSTNT] Hotword detected:", payload)
        this.hotwordDetected(payload)
        break
      case 'READY':
        this.status = "HOTWORD_STANDBY"
        this.sendSocketNotification("HOTWORD_STANDBY")
        break
      case 'HOTWORD_STANDBY':
        this.status = "HOTWORD_STANDBY"
        console.log("STANDBY*****")
        console.log("[ASSTNT] Hotword detection standby")
        this.sendSocketNotification("HOTWORD_STANDBY")
        break
      case 'ASSISTANT_FINISHED':
        if (payload == 'ASSISTANT') {
          this.status = "HOTWORD_STANDBY";
          this.sendSocketNotification("HOTWORD_STANDBY")
        }
        break
      case 'COMMAND':
        this.status = "COMMAND";
        console.log("[ASSTNT] Command:", payload)
        this.parseCommand(payload, this.sendSocketNotification.bind(this))
        //this.sendSocketNotification("HOTWORD_STANDBY")
        break;
      case 'ERROR':
        this.status = "ERROR"
        console.log("[ASSTNT] Error:", payload)
        //this.sendSocketNotification("HOTWORD_STANDBY")
        break
      case 'MODE':
        this.status = payload.mode
        if (payload.mode == 'SPEAK_ENDED') {
          //CUIDADO AQUI, AL COMENTAR ESTA LINEA E ARREGLO ERROR DEL SPEECH DE CLIMA PERO PUEDE MARCAR OTROS
          this.sendNotification("HIDE_ALERT");
          this.sendSocketNotification("HOTWORD_STANDBY")
        }

        if (payload.mode == 'SPEAK_STARTED') {
          if (payload.useAlert) {
            var html = "<p class='yourcommand mdi mdi-voice'> \"" + payload.originalCommand + "\"</p>"
            html += "<div class='answer'>" + payload.text + "</div>"
            this.sendNotification(
              'SHOW_ALERT',
              {
                title: "[MMMAM-Assistant]",
                message: html,
                imageFA: "microphone",
                timer: 120000,
              }
            )
          }
        }
        this.updateDom()
    }
  },

  hotwordDetected : function (type) {

    if (type == 'ASSISTANT') {
      //console.log("ASSISTANT");
      //this.sendSocketNotification('ACTIVATE_ASSISTANT')
      //this.status = 'ACTIVATE_ASSISTANT'
    } else if (type == 'EMMA') {

      this.sendSocketNotification('ACTIVATE_COMMAND')
      this.status = 'ACTIVATE_COMMAND'
    }

  },

  parseCommand: function(msg, cb) {
    var args = null
    var response = null
    if (typeof msg == 'undefined') {
      cb("HOTWORD_STANDBY")
      return
    }
    var msgText = msg
    var commandFound = 0
    var c
    for(var i in this.commands) {
      c = this.commands[i]
      var commandPattern = c.execute
      // :args or :args(pattern)
      var argsPattern = /\:([^\(\s]+)(\(\S+\))?/g
      var hasArgs = commandPattern.match(argsPattern)
      var argsGroup = []
      var args = []
      if (hasArgs) {
        var ta = []
        hasArgs.forEach((arg)=>{
          var argPattern = /\:([^\(\s]+)(\(\S+\))?/g
          var ma = argPattern.exec(arg)
          var pattern = {}
          pattern.origin = ma[0]
          pattern.pattern = (ma[2]) ? ma[2] : "(.*)"
          ta.push(pattern)
          argsGroup.push(ma[1])
        })
        ta.forEach((arg)=>{
          commandPattern = commandPattern.replace(arg.origin, arg.pattern)
        })
      } else { // command has no args pattern
        argsGroup = []
      }
      var matched = ("^" + commandPattern).toRegExp().exec(msgText)

      if (matched) {
        commandFound = 1
        if (argsGroup) {
          for(var j=0; j<argsGroup.length ;j++) {
            args[argsGroup[j]] = matched[j+1]
          }
        }
      }
      if (commandFound == 1) {
        break
      }
    }
    if (commandFound == 1) {
      if (c.callback !== 'notificationReceived') {
        var callbacks = {
          response: this.response.bind(this)
        }
        var handler = new AssistantHandler(msg, args, callbacks)
        c.module[c.callback].bind(c.module)
        c.module[c.callback](c.execute, handler)
      } else {
        c.module[c.callback].bind(c.module)
        c.module[c.callback](c.execute, args)
      }
    } else {
      var callbacks = {
        response: this.response.bind(this)
      }
      var handler = new AssistantHandler(msg, null, callbacks)
      //this.sendNotification('ASSISTANT_PAUSED')
      var option = {
        language: 'es-ES',
        useAlert: false
      }
      this.sendNotification('ASSISTANT_START')
      handler.reply("TEXT",this.translate("INVALID_COMMAND"), option)
      this.sendNotification('ASSISTANT_START')
    }
    //cb("HOTWORD_STANDBY")
  },

  response: function(text, originalCommand, option) {
    this.sendSocketNotification('SPEAK', {text:text, option:option, originalCommand:originalCommand})
    this.status = 'SPEAK'
  },

  loadCSS: function() {
    var css = [
      {
        id:'materialDesignIcons',
        href: 'https://cdn.materialdesignicons.com/2.0.46/css/materialdesignicons.min.css',
      },
    ]
    css.forEach(function(c) {
      if (!document.getElementById(c.id))
      {
        var head  = document.getElementsByTagName('head')[0]
        var link  = document.createElement('link')
        link.id   = c.id
        link.rel  = 'stylesheet'
        link.type = 'text/css'
        link.href = c.href
        link.media = 'all'
        head.appendChild(link)
      }
    })
  },

  configAssignment : function (result) {
    var stack = Array.prototype.slice.call(arguments, 1);
    var item;
    var key;
    while (stack.length) {
      item = stack.shift();
      for (key in item) {
        if (item.hasOwnProperty(key)) {
          if (
            typeof result[key] === 'object'
            && result[key]
            && Object.prototype.toString.call(result[key]) !== '[object Array]'
          ) {
            if (typeof item[key] === 'object' && item[key] !== null) {
              result[key] = this.configAssignment({}, result[key], item[key]);
            } else {
              result[key] = item[key];
            }
          } else {
            result[key] = item[key];
          }
        }
      }
    }
    return result;
  },
})

function AssistantCommandRegister (module, registerCallback) {
  this.module = module
  this.registerCallback = registerCallback
}

AssistantCommandRegister.prototype.add = function (commandObj) {
  this.registerCallback(this.module, commandObj)
}

function AssistantHandler (message, args, callbacks) {
  this.args = args
  this.message = message
  this.callbacks = callbacks
}

AssistantHandler.prototype.response = function(text, opts) {
  this.callbacks.response(text, this.message, opts)
}

AssistantHandler.prototype.say = function(type, text, opts) {
  //for compatibility with MMM-TelegramBot
  var msg = "UNSPEAKABLE"
  if (type == 'TEXT') {
    msg = text
  }
  this.response(msg, opts)
}

AssistantHandler.prototype.reply = function(type, text, opts) {
  //for compatibility with MMM-TelegramBot
  this.say(type, text, opts)
}

AssistantHandler.prototype.ask = function(type, text, opts) {
  //for compatibility with MMM-TelegramBot
  var msg = "INVALID_FORMAT"
  this.response(msg, opts)
}

class ASTMessage {
  constructor() {
    this.class = 'Assistant'
  }
}
