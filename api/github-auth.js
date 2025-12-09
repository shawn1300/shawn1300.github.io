export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', 'https://shawn1300.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 简化版：直接返回成功，跳过GitHub登录
  res.status(200).json({
    success: true,
    message: 'GitHub登录功能暂未启用，请使用匿名留言',
    guestMode: true
  });
}
