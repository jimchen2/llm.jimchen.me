// Single source of truth for the /radio page station list.
//
// The list used to live inline in public/radio.html. It is now served through
// /api/radio/status (see app/api/radio/status/route.js) so the browser can get
// the station metadata together with the server-side availability check.
//
// `url` is the real upstream stream. The browser never sees it directly for
// http:// streams: those are rewritten to /api/radio/stream?i=<index> so they
// are not blocked as mixed content on the https:// page (see lib/radio.js).
export const RADIO_STATIONS = [
  { name: 'Говорит Москва', city: 'Москва', url: 'https://media.govoritmoskva.ru/ru64.mp3' },
  { name: 'Комсомольская Правда', city: 'Москва', url: 'https://kpradio.hostingradio.ru:8000/russia.radiokp128.mp3' },
  { name: 'Радио Звезда', city: 'Москва', url: 'https://zvezda-radio128.mediacdn.ru/radio/zvezda/zvezda_128' },
  { name: 'Радио Культура', city: 'Москва', url: 'https://icecast-vgtrk.cdnvideo.ru/kulturafm' },
  { name: 'Радио 1', city: 'Москва', url: 'https://stream.radio1.ru/memfs/49dee7fe-77ba-4e6b-8cdc-fa840535b242.m3u8' },
  { name: 'Радио России', city: 'Москва', url: 'https://icecast-vgtrk.cdnvideo.ru/rrzonam_mp3_128kbps' },
  { name: 'Радио Маяк', city: 'Москва', url: 'https://icecast-vgtrk.cdnvideo.ru/mayakfm_mp3_192kbps' },
  { name: 'Вести FM', city: 'Москва', url: 'https://icecast-vgtrk.cdnvideo.ru/vestifm' },
  { name: 'Коммерсантъ FM', city: 'Москва', url: 'https://kommersant77.hostingradio.ru:8085/kommersant128.mp3' },
  { name: 'Бизнес FM', city: 'Москва', url: 'https://bfm.hostingradio.ru:9075/fm' },
  { name: 'Москва FM', city: 'Москва', url: 'https://icecast-vgtrk.cdnvideo.ru/moscowfm128' },
  { name: 'Радонеж', city: 'Москва', url: 'https://icecast-radonezh.cdnvideo.ru/rad128' },
  { name: 'Радиокнига', city: 'Москва', url: 'https://bookradio.hostingradio.ru:8069/fm' },
  { name: 'Радио Спутник. Россия Сегодня', city: 'Москва', url: 'https://icecast-rian.cdnvideo.ru/voicerus' },
  { name: 'Радио Москвы', city: 'Москва', url: 'https://icecast-vgtrk.cdnvideo.ru/moscowtalk128' },
  { name: 'Радио Фантастики', city: 'Москва', url: 'https://listen9.myradio24.com/55699' },
  { name: 'Радио Вера', city: 'Москва', url: 'http://77.39.8.49:8000/vera_air_96' },
  { name: 'Davidzon Radio', city: 'США (Нью-Джерси)', url: 'http://radioserver.abinet.com:8800/dr.aac' },
  { name: 'Радио России (Нижний Новгород)', city: 'Нижний Новгород', url: 'https://icecast-vgtrk.cdnvideo.ru/russiafm_nn' },
  { name: 'Старое радио', city: 'Москва', url: 'http://195.91.237.50:8000/ices128' },
  { name: 'Радио Маяк (Нижний Новгород)', city: 'Нижний Новгород', url: 'https://icecast-vgtrk.cdnvideo.ru/mayak_nn' },
  { name: 'Радио России (Санкт-Петербург)', city: 'Санкт-Петербург', url: 'https://radio.rtr.spb.ru/live1' },
  { name: 'Благовещение', city: 'Москва', url: 'https://radio-blagoveshchenie.ru:10005/stream' },
  { name: 'Модель для сборки', city: 'Москва', url: 'http://mds-station.com:8000/mds' },
  { name: 'Радио Зенит', city: 'Санкт-Петербург', url: 'https://radiozenit.hostingradio.ru/radiozenit256.mp3' },
  { name: 'Радио России (Пермь)', city: 'Пермь', url: 'https://podcast-gtrk.smotrim.ru/vgtrk/perm/radio_russia/index.m3u8' },
  { name: 'Маяк (Самара)', city: 'Самара', url: 'https://podcast-gtrk.smotrim.ru/vgtrk/samara/mayak/index.m3u8' },
  { name: 'Радио России (Самара)', city: 'Самара', url: 'https://podcast-gtrk.smotrim.ru/vgtrk/samara/radio_russia/index.m3u8' },
  { name: 'Бизнес FM (Санкт-Петербург)', city: 'Санкт-Петербург', url: 'https://bfmreg.hostingradio.ru/spb.bfm128.mp3' },
  { name: 'Маяк (Барнаул)', city: 'Барнаул', url: 'http://gtrk22.ru:8000/mayak22' },
  { name: 'Радио Всероссийского общества слепых (ВОС)', city: 'Москва', url: 'http://radiovos.ru:9000/radiovos-128' },
  { name: 'Радио Справедливая Россия', city: 'Москва', url: 'https://spravedlivo.hostingradio.ru:8022/spravedlivo128.mp3' },
  { name: 'Комсомольская Правда (Санкт-Петербург)', city: 'Санкт-Петербург', url: 'https://kpradio.hostingradio.ru:8000/spb.radiokp128.mp3' },
  { name: 'Комсомольская Правда (Новосибирск)', city: 'Новосибирск', url: 'https://kpradio.hostingradio.ru:8000/novosibirsk.radiokp128.mp3' },
  { name: 'Радио Музком', city: 'Москва', url: 'https://geshou.s02.radio-tochka.com:5005/stream' },
  { name: 'Радио России (Иваново)', city: 'Иваново', url: 'https://podcast-gtrk.smotrim.ru/vgtrk/ivanovo/radio_russia/index.m3u8' },
  { name: 'Радио Воскресенье', city: 'Екатеринбург', url: 'http://217.24.181.164:8000/stream.mp3' },
  { name: 'Бизнес FM (Нижний Новгород)', city: 'Нижний Новгород', url: 'https://online-2.gkvr.ru:8000/bfm_nno_64.aac' },
  { name: 'Коммерсантъ FM (Нижний Новгород)', city: 'Нижний Новгород', url: 'https://kommersant77.hostingradio.ru:8085/kommersant128.mp3' },
  { name: 'Комсомольская правда (Екатеринбург)', city: 'Екатеринбург', url: 'https://kpradio.hostingradio.ru:8000/ekaterinburg.radiokp128.mp3' },
  { name: 'Радио России (Пенза)', city: 'Пенза', url: 'https://icecast-vgtrk.cdnvideo.ru/rr_penza_aac' },
];
