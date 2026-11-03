const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'context', 'LanguageContext.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

const target = `    exitPosition: 'पोजीशन बंद करें',
    chart: 'चार्ट',
  },`;

const replacement = `    exitPosition: 'पोजीशन बंद करें',
    chart: 'चार्ट',
    // Bug #30: Hindi translations for tour and onboarding
    welcomeToGoldfut: 'GoldFut में आपका स्वागत है',
    tourSubtitle: 'आइए आपके ट्रेडिंग कार्यक्षेत्र का एक त्वरित दौरा करें।',
    tourDescription: 'जानें कि इंस्ट्रूमेंट्स कैसे खोजें, मार्केट डेटा कैसे पढ़ें और अपना पहला अभ्यास ट्रेड कैसे करें।',
    startGuidedTour: 'गाइडेड टूर शुरू करें',
    maybeLater: 'शायद बाद में',
    skipTour: 'टूर छोड़ें',
    back: 'पीछे',
    next: 'आगे',
    finish: 'समाप्त',
    tourEstimatedTime: '2 मिनट',
    tourStepCount: '8 चरण',
    step1Title: 'आपकी वॉचलिस्ट',
    step1Desc: 'जिन इंस्ट्रूमेंट्स को आप फॉलो करते हैं उन्हें एक जगह रखें और उनके नवीनतम बाजार मूल्यों पर नज़र रखें।',
    step2Title: 'बाजार का अन्वेषण करें',
    step2Desc: 'जिन इंस्ट्रूमेंट्स में आप ट्रेड करना चाहते हैं उन्हें तुरंत खोजने के लिए मार्केट श्रेणियों के बीच स्विच करें।',
    step3Title: 'इंस्ट्रूमेंट खोजें',
    step3Desc: 'मार्केट विवरण तुरंत खोलने के लिए नाम या प्रतीक द्वारा किसी इंस्ट्रूमेंट को खोजें।',
    step4Title: 'मार्केट डेटा समझें',
    step4Desc: 'प्रत्येक इंस्ट्रूमेंट अपनी वर्तमान कीमत, मूल्य संचलन और आपके इंट्राडे और होल्डिंग मान दिखाता है।',
    step5Title: 'ट्रेडिंग स्क्रीन खोलें',
    step5Desc: 'इसकी मार्केट जानकारी देखने और ऑर्डर पैनल तक पहुंचने के लिए किसी इंस्ट्रूमेंट पर टैप करें।',
    step6Title: 'मूल्य चार्ट पढ़ें',
    step6Desc: 'कैंडलस्टिक चार्ट पर लाइव मूल्य संचलन देखें। हरी कैंडल = कीमत बढ़ी, लाल कैंडल = कीमत घटी।',
    step7Title: 'अपना ऑर्डर बनाएं',
    step7Desc: 'अपनी मात्रा और ऑर्डर प्रकार चुनें। आप ऑर्डर देने से पहले स्टॉप लॉस या टारगेट भी सेट कर सकते हैं।',
    step8Title: 'समीक्षा करें और अपना ट्रेड करें',
    step8Desc: 'ऑर्डर विवरण की समीक्षा करें, फिर अपना ऑर्डर सबमिट करने के लिए बेचें या खरीदें चुनें।',
  },`;

if (normalize(content).includes(normalize(target))) {
  content = normalize(content).replace(normalize(target), normalize(replacement));
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully patched LanguageContext.tsx');
} else {
  console.error('Target not found in LanguageContext.tsx');
}
