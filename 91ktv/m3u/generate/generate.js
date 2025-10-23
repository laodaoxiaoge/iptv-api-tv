const axios = require('axios');
const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');

// 配置信息
const config = {
  title: '91看电视直播源',
  host: 'http://sj.91kds.cn',
  class_name: '央视&卫视&高清&4K&影视&体育&动漫&财经&综艺&教育&新闻&纪录&国际&网络&购物&虎牙&安徽&北京&重庆&福建&甘肃&湖北&湖南&吉林&江苏&江西&辽宁&内蒙古&宁夏&青海&山东&山西&陕西&上海&贵州&海南&河北&河南&黑龙江&天津&新疆&西藏&云南&浙江&广西&广东&四川',
  class_url: '央视&卫视&高清&4K&影视&体育&动漫&财经&综艺&教育&新闻&纪录&国际&网络&购物&虎牙&安徽&北京&重庆&福建&甘肃&湖北&湖南&吉林&江苏&江西&辽宁&内蒙古&宁夏&青海&山东&山西&陕西&上海&贵州&海南&河北&河南&黑龙江&天津&新疆&西藏&云南&浙江&广西&广东&四川',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  },
  timeout: 10000,
  outputFile: '91ktv.m3u',
  maxRetries: 3,
  delayBetweenRequests: 800 // 毫秒
};

// 获取分类列表
function getCategories() {
  const classNames = config.class_name.split('&');
  const classUrls = config.class_url.split('&');
  
  return classNames.map((name, index) => ({
    name: name.trim(),
    url: classUrls[index].trim()
  }));
}

// 带重试机制的HTTP请求
async function fetchWithRetry(url, options = {}, retries = config.maxRetries) {
  try {
    const response = await axios.get(url, {
      ...options,
      timeout: config.timeout,
      headers: config.headers
    });
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`请求失败，剩余重试次数: ${retries}，URL: ${url}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

// 获取分类下的频道列表
async function getChannelsByCategory(category) {
  try {
    const url = `${config.host}/api/get_channel.php?id=${encodeURIComponent(category.url)}`;
    const response = await fetchWithRetry(url);
    
    if (!response.data || !Array.isArray(response.data)) {
      console.error(`获取分类 ${category.name} 的频道列表失败`);
      return [];
    }
    
    const nwtime = Math.floor(Date.now() / 1000);
    const channels = [];
    
    for (const item of response.data) {
      const srcKey = `${item.ename}com.jiaoxiang.fangnaleahkajfkahlajjaflfakhfakfbuyaozaigaolefuquqikangbuzhu2.3.4fu:ck:92:92:ff${nwtime}20240918`;
      const sign = CryptoJS.MD5(srcKey).toString();
      
      channels.push({
        id: item.ename,
        name: item.name,
        icon: item.icon,
        url: `http://sjapi1.91kds.cn/api/get_source.php?ename=${item.ename}&app=com.jiaoxiang.fangnale&version=2.3.4&mac=fu:ck:92:92:ff&nwtime=${nwtime}&sign=${sign}&ev=20240918`,
        category: category.name
      });
    }
    
    return channels;
  } catch (error) {
    console.error(`获取分类 ${category.name} 的频道列表出错:`, error.message);
    return [];
  }
}

// 获取频道的播放源
async function getChannelSources(channel) {
  try {
    const response = await fetchWithRetry(channel.url);
    const data = response.data;
    
    if (!data || !data.liveSource || !Array.isArray(data.liveSource)) {
      console.error(`频道 ${channel.name} 没有可用的播放源`);
      return [];
    }
    
    const sources = [];
    const seen = new Set();
    let lineCounter = 1;
    
    for (let i = 0; i < data.liveSource.length; i++) {
      const rawInput = data.liveSource[i];
      const urlName = data.liveSourceName?.[i] || `线路${lineCounter}`;
      
      let inputUrl = rawInput.replace(/^kdsvod:\/\//, '');
      
      // 处理带密码的URL
      if (inputUrl.includes('pwd=jsdecode') && inputUrl.includes('id=')) {
        const parts = inputUrl.split('?');
        const baseUrl = parts[0];
        const queryStr = parts[1] || '';
        const queryObj = {};
        
        queryStr.split('&').forEach(kv => {
          const [key, value] = kv.split('=');
          if (key) queryObj[key] = decodeURIComponent(value || '');
        });
        
        const id = queryObj['id'];
        const bt = queryObj['bt'] || null;
        const coreKey = `${bt || ''}_${id}`;
        
        // 去重检查
        if (seen.has(coreKey)) continue;
        seen.add(coreKey);
        
        const params = {
          app: 'com.jiaoxiang.fangnale',
          version: '2.3.4',
          mac: 'fu:ck:92:92:ff',
          utk: '',
          nwtime: Math.floor(Date.now() / 1000),
          ev: '20250113'
        };
        
        const appendStr = 'ahkajfkahlajjaflfakhfakfbuyaozaigaolefuquqikangbuzhu';
        let signStr = id;
        
        Object.keys(params).forEach(key => {
          if (key === 'tmk') return;
          signStr += (key === 'app') ? params[key] + appendStr : params[key];
        });
        
        params.sign = CryptoJS.MD5(signStr).toString();
        const finalQuery = [];
        
        if (bt !== null) finalQuery.push(`bt=${bt}`);
        finalQuery.push(`id=${id}`);
        
        Object.keys(params).forEach(k => {
          finalQuery.push(`${k}=${encodeURIComponent(params[k])}`);
        });
        
        const finalUrl = `${baseUrl}?${finalQuery.join('&')}`;
        sources.push({
          name: urlName,
          url: finalUrl
        });
        
        lineCounter++;
      } 
      // 处理普通URL
      else {
        let videoUrl = inputUrl;
        
        if (inputUrl.startsWith('htmlplay://')) {
          videoUrl = inputUrl.replace('htmlplay://', '').split('#')[0];
        }
        
        // 去重检查
        if (seen.has(videoUrl)) continue;
        seen.add(videoUrl);
        
        // 处理带referer的URL
        if (inputUrl.includes('@@referer=')) {
          const [urlPart, referer] = inputUrl.split('@@referer=');
          videoUrl = urlPart;
          
          // 对于需要referer的URL，我们无法在M3U中直接使用
          // 这里可以选择跳过或特殊处理
          console.warn(`频道 ${channel.name} 的播放源需要referer: ${referer}`);
          continue;
        }
        
        sources.push({
          name: urlName,
          url: videoUrl
        });
        
        lineCounter++;
      }
    }
    
    return sources;
  } catch (error) {
    console.error(`获取频道 ${channel.name} 的播放源出错:`, error.message);
    return [];
  }
}

// 生成M3U播放列表
function generateM3U(channels) {
  let m3uContent = '#EXTM3U\n';
  
  for (const channel of channels) {
    if (!channel.sources || channel.sources.length === 0) continue;
    
    // 使用第一个播放源
    const source = channel.sources[0];
    
    m3uContent += `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}" tvg-logo="${channel.icon}" group-title="${channel.category}",${channel.name}\n`;
    m3uContent += `${source.url}\n`;
    
    // 如果有多个播放源，作为备用线路
    if (channel.sources.length > 1) {
      for (let i = 1; i < channel.sources.length; i++) {
        const altSource = channel.sources[i];
        m3uContent += `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name} (${altSource.name})" tvg-logo="${channel.icon}" group-title="${channel.category}",${channel.name} (${altSource.name})\n`;
        m3uContent += `${altSource.url}\n`;
      }
    }
  }
  
  return m3uContent;
}

// 主函数
async function main() {
  console.log('开始获取91看电视直播源...');
  
  // 获取所有分类
  const categories = getCategories();
  console.log(`发现 ${categories.length} 个分类`);
  
  const allChannels = [];
  
  // 遍历所有分类获取频道
  for (const category of categories) {
    console.log(`正在处理分类: ${category.name}`);
    
    const channels = await getChannelsByCategory(category);
    console.log(`在分类 ${category.name} 中发现 ${channels.length} 个频道`);
    
    // 获取每个频道的播放源
    for (const channel of channels) {
      console.log(`正在获取频道 ${channel.name} 的播放源...`);
      channel.sources = await getChannelSources(channel);
      
      if (channel.sources.length > 0) {
        console.log(`找到 ${channel.sources.length} 个播放源`);
        allChannels.push(channel);
      }
      
      // 添加延迟避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
    }
  }
  
  console.log(`总共获取到 ${allChannels.length} 个有效频道`);
  
  // 生成M3U内容
  const m3uContent = generateM3U(allChannels);
  
  // 保存到文件
  const outputPath = path.join(__dirname, config.outputFile);
  fs.writeFileSync(outputPath, m3uContent, 'utf8');
  
  console.log(`M3U播放列表已保存到: ${outputPath}`);
  console.log('完成!');
}

// 执行主函数
main().catch(err => {
  console.error('程序运行出错:', err);
  process.exit(1);
});

