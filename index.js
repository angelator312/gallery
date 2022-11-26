const {
  srandom
} = require('./jsonwjs')
const { Mongostore } = require('./mongostore')
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const sharp = require('sharp');
const app = express();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (req.cookies.lognat) {
      session.getkey(req.cookies.lognat).then((data) => {
        cb(null, 'image/' + data.username)
      })
    } else {
      throw new Error('ne si lognat')
    }
  },
  filename: function (req, file, cb) {
    proverka(file, cb)
  }
})
const templatePath = path.join(__dirname, 'views');
const upload = multer({ dest: 'image/', storage });
const session = new Mongostore('session.json');
const registry = new Mongostore('registry.json');
const port = process.env.PORT ?? 8080;
const cookieage = 60000 * 30
// свързваме монгото-: сесия и регистър
session.conect(process.env.MONGO_URL);
registry.conect(process.env.MONGO_URL);
function proverka(file, cb) {
  fs.stat(`image/${file.originalname}`).then(() => {
    let nexte = file.originalname.substring(file.originalname.lastIndexOf('.'))
    let newname = file.originalname.substring(0, file.originalname.lastIndexOf('.')) + new Date().getTime() + nexte;
    cb(null, newname)
  }).catch((err) => cb(null, file.originalname));
}
async function sendFile(path, res, user) {
  try {
    const data = await fs.readFile(`image/${user}/${path}`);
    const image = await sharp(data)
      .composite([
        { input: 'aletter.jpg', gravity: 'northwest' }
      ])
      .jpeg({ mozjpeg: true })
      .toBuffer();
    res.writeHead(200, { 'Content-Type': `image/jpeg` });
    res.write(image);
    return res.end();
  } catch (error) {
    res.writeHead(404, { 'Content-Type': `text/html; charset=utf-8` });
    res.write('<h1>404</h1>');
    res.write('няма такъв файл no such file');
    return res.end();
  }
}
// конфигурации
app.engine('.html', require('ejs').__express);
// конфигурираме къде се намират файловете с темплейти
app.set('views', templatePath);

app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieParser());
// Конфигурираме  разширението по подразбиране за темплейтите
app.set('view engine', '.html');
// край на конфигурациите
app.get('/', async function (req, res) {
  if (req.cookies.lognat) {
    const data = await session.getkey(req.cookies.lognat);
    try {
      fs.stat(`image/${data.username}/`)
    } catch (error) {
      fs.mkdir(`image/${data.username}/`)
    }
    const imageList = (await fs.readdir(`${process.cwd()}/image/` + data.username)).filter(t => t.endsWith('.jpg') || t.endsWith('.png'))|| [];
    res.render('index', {
      iList: imageList,
      username: data.username
    });
  } else {
    res.redirect('/login');
  }

});
app.get('/favicon.ico', async function (req, res) {
  const data = await fs.readFile(`/favicon.ico`);
  res.writeHead(200, { 'Content-Type': `image/jpeg` });
  res.write(data);
  return res.end();
});
// регистри
app.get('/registyr', function (req, res) {
  res.render('registry', {
    yorn: null
  });
});
app.get('/registyrregistyr', async function (req, res) {
  if (await registry.getkey(req.query.username)) {
    res.render('registry', {
      yorn: 'Има такъв user'
    });
    return
  }
  if (req.query.password == req.query.password2) {
    let sid = srandom();
    await registry.addkey(req.query.username, {
      username: req.query.username,
      password: req.query.password
    });
    res.cookie('lognat', sid, { maxAge: cookieage })
    await session.addkey(sid, {
      username: req.query.username,
      password: req.query.password
    });
    fs.mkdir('image/' + req.query.username);
    res.redirect('/');
  }
});
app.get('/dregistyr', async function (req, res) {
  const key = (
    await session.getkey(req.cookies.lognat)
  ).username;
  fs.rm('image/' + key, { recursive: true });
  await registry.deletekey(key);
  res.redirect('/logout');
});
//  вход
app.get('/login', function (req, res) {
  res.render('login', {
    yorn: ''
  });
});
app.get('/loginregister2', async function (req, res) {
  let valid = false;
  let username = req.query.username;
  let password = req.query.password;
  try {
    const data = await registry.getkey(username);
    if (data.username == username && data.password == password) {
      valid = true;
    } else {
      res.render('login', {
        yorn: 'има грешка в username или в password'
      });
      return;
    }
    if (valid) {
      let sid = srandom();
      await session.addkey(sid, { username, password });
      res.cookie('lognat', sid, { maxAge: cookieage });
      res.redirect('/');
      return;
    }
  } catch (error) {
    res.render('login', {
      yorn: 'има грешка в username или в password'
    })
    return;
  }
});
app.get('/logout', async function (req, res) {
  await session.deletekey(req.cookies.lognat)
  res.clearCookie('lognat');
  res.redirect('/');

});
// качване на снимки
app.get('/upload', function (req, res) {
  if (req.cookies.lognat) {
    res.render('upload', {
    });
  } else {
    res.redirect('/login');
  }
});
app.post('/uploadimage', upload.single('myfile'), function (req, res, next) {
  res.redirect('/');
});
// премахване на снимки
app.get('/delimage', function (req, res) {
  res.render('delimage', {
    yorn: null
  });
});
app.get('/deleteimage', async function (req, res) {
  if([...req.query.myfile].some((v)=>{v='%'})){
    res.redirect('/delimage');
    return;
  }
  try {
    if(!await fs.stat('image/'+
    (await session.getkey(req.cookies.lognat)).username+'/'
    +req.query.myfile))
    {
      throw new Error('');
    }
    await fs.rm('image/'+
    (await session.getkey(req.cookies.lognat)).username+'/'
    +req.query.myfile);
    res.redirect('/');
    return;
  } catch (error) {
    res.redirect('/delimage');
    return;
  }
});
// разглеждане на снимки
app.get('/image/:path?', async function (req, res) {
  const user=(await session.getkey(req.cookies.lognat)).username
  if(!user){
    res.redirect('/login');
    return;
  }
  try {
    fs.stat(`image/${user}/`)
  } catch (error) {
    fs.mkdir(`image/${user}/`)
  }
  sendFile(req.params.path, res,user)
});
app.listen(port, () => {
  console.log('Express server listening in port %s', port);
});