// utils/api.js - 基金数据API工具类

/**
 * 获取基金估值数据
 * @param {string} code - 基金代码
 * @returns {Promise<Object>} 基金数据
 */
export const fetchFundData = (code) => {
  return new Promise((resolve, reject) => {
    // 使用天天基金的JSONP接口
    wx.request({
      url: `https://fundgz.1234567.com.cn/js/${code}.js`,
      method: 'GET',
      dataType: 'text', // 指定为文本类型，保留原始编码
      responseType: 'text', // 响应类型为文本
      success: (res) => {
        try {
          // 解析JSONP格式: jsonpgz({...})
          const jsonStr = res.data.replace(/^jsonpgz\(/, '').replace(/\);?$/, '');
          const data = JSON.parse(jsonStr);
          
          if (!data || !data.fundcode) {
            reject(new Error('数据格式错误'));
            return;
          }

          const result = {
            code: data.fundcode,
            name: data.name,
            dwjz: data.dwjz, // 单位净值
            gsz: data.gsz, // 估算净值
            gztime: data.gztime, // 估值时间
            jzrq: data.jzrq, // 净值日期
            gszzl: parseFloat(data.gszzl) || 0 // 估算涨跌百分比
          };

          resolve(result);
        } catch (error) {
          console.error('解析基金数据失败:', error);
          reject(error);
        }
      },
      fail: (error) => {
        console.error('获取基金数据失败:', error);
        reject(error);
      }
    });
  });
};

/**
 * 获取基金持仓数据（使用JSON API）
 * @param {string} code - 基金代码
 * @returns {Promise<Array>} 持仓列表
 */
export const fetchFundHoldings = (code) => {
  return new Promise((resolve) => {
    // 使用天天基金的持仓API（返回JSON格式，避免GBK编码问题）
    wx.request({
      url: `https://fund.eastmoney.com/f10/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10&year=&month=&rt=${Math.random()}`,
      method: 'GET',
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        try {
          let data = res.data;
          
          // 如果返回的是字符串，尝试提取content字段
          if (typeof data === 'string') {
            // 尝试匹配 content:"..." 格式
            const contentMatch = data.match(/content:"(.*?)"/);
            if (contentMatch && contentMatch[1]) {
              data = contentMatch[1];
              // 解码转义字符
              data = data.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
          }
          
          // 解析HTML获取持仓数据
          const html = typeof data === 'string' ? data : (data.content || '');
          const holdings = parseHoldingsFromHTML(html);
          
          console.log(`成功获取基金 ${code} 持仓数据，共 ${holdings.length} 条`);
          resolve(holdings);
        } catch (error) {
          console.error('解析持仓数据失败:', error);
          resolve([]);
        }
      },
      fail: (error) => {
        console.error('获取持仓数据失败:', error);
        resolve([]);
      }
    });
  });
};

/**
 * 从HTML中解析持仓数据
 * @param {string} html - HTML内容
 * @returns {Array} 持仓列表
 */
function parseHoldingsFromHTML(html) {
  const holdings = [];
  
  try {
    // 提取表格行
    const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    
    for (let i = 0; i < trMatches.length && holdings.length < 10; i++) {
      const tr = trMatches[i];
      const tdMatches = tr.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi);
      
      if (!tdMatches || tdMatches.length < 3) continue;
      
      // 提取纯文本
      const cells = tdMatches.map(td => 
        td.replace(/<[^>]*>/g, '').trim()
      );
      
      // 跳过表头行
      if (cells.some(cell => cell.includes('序号') || cell.includes('股票代码') || cell.includes('股票名称'))) {
        continue;
      }
      
      // 按顺序查找：序号、代码、名称、权重
      let code = '';
      let name = '';
      let weight = '';
      let foundCode = false;
      
      for (const cell of cells) {
        // 跳过空单元格
        if (!cell) continue;
        
        // 跳过序号（纯数字且小于20）
        if (/^\d{1,2}$/.test(cell) && parseInt(cell) < 20) {
          continue;
        }
        
        // 查找股票代码（6位数字）
        if (/^\d{6}$/.test(cell)) {
          code = cell;
          foundCode = true;
          continue;
        }
        
        // 查找权重（以%结尾）
        if (/%$/.test(cell)) {
          weight = cell;
          continue;
        }
        
        // 在找到代码之后，第一个非代码、非权重的单元格就是名称
        if (foundCode && !name && cell.length > 1) {
          name = cell;
        }
      }
      
      // 只有同时有代码和名称才添加
      if (code && name) {
        holdings.push({
          code: code,
          name: name,
          weight: weight || '0%',
          change: null
        });
      }
    }
  } catch (error) {
    console.error('解析HTML失败:', error);
  }
  
  return holdings.slice(0, 10);
}

/**
 * 获取股票实时行情
 * @param {Array} holdings - 持仓列表
 * @returns {Promise<Array>} 带涨跌幅的持仓列表
 */
export const fetchStockQuotes = (holdings) => {
  return new Promise((resolve) => {
    if (!holdings || holdings.length === 0) {
      resolve([]);
      return;
    }

    // 构建腾讯财经查询代码
    const codes = holdings
      .filter(h => h.code && /^\d{6}$/.test(h.code))
      .map(h => {
        const code = h.code;
        // 判断股票市场
        const prefix = code.startsWith('6') || code.startsWith('9') ? 'sh' 
                     : code.startsWith('0') || code.startsWith('3') ? 'sz' 
                     : code.startsWith('4') || code.startsWith('8') ? 'bj' 
                     : 'sz';
        return `s_${prefix}${code}`;
      })
      .join(',');

    if (!codes) {
      resolve(holdings);
      return;
    }

    wx.request({
      url: `https://qt.gtimg.cn/q=${codes}`,
      method: 'GET',
      dataType: 'text',
      responseType: 'text',
      success: (res) => {
        try {
          // 解析腾讯财经数据
          const text = res.data;
          
          holdings.forEach(holding => {
            if (!holding.code || !/^\d{6}$/.test(holding.code)) return;
            
            const code = holding.code;
            const prefix = code.startsWith('6') || code.startsWith('9') ? 'sh' 
                         : code.startsWith('0') || code.startsWith('3') ? 'sz' 
                         : code.startsWith('4') || code.startsWith('8') ? 'bj' 
                         : 'sz';
            const varName = `v_s_${prefix}${code}`;
            
            // 提取对应股票的数据
            const regex = new RegExp(`${varName}="([^"]*)"`, 'i');
            const match = text.match(regex);
            
            if (match && match[1]) {
              const parts = match[1].split('~');
              if (parts.length > 5) {
                holding.change = parseFloat(parts[5]) || 0;
                // 注释掉：不使用行情接口返回的股票名称，保留持仓接口返回的名称（避免编码问题）
                // holding.name = parts[1] || holding.name;
              }
            }
          });
          
          resolve(holdings);
        } catch (error) {
          console.error('解析股票行情失败:', error);
          resolve(holdings);
        }
      },
      fail: (error) => {
        console.error('获取股票行情失败:', error);
        resolve(holdings);
      }
    });
  });
};

/**
 * 收盘后获取当日实际净值（fundgz 接口不更新 dwjz，需要用历史净值接口补充）
 */
export const fetchLatestNav = (code) => {
  return new Promise((resolve) => {
    wx.request({
      url: `http://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=1&rt=${Math.random()}`,
      method: 'GET',
      dataType: 'text',
      responseType: 'text',
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? res.data : '';
          const contentMatch = data.match(/content:"([\s\S]*?)"/);
          if (!contentMatch) { resolve(null); return; }

          const html = contentMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

          for (let i = 0; i < trMatches.length; i++) {
            const tdMatches = trMatches[i].match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi);
            if (!tdMatches || tdMatches.length < 3) continue;
            const cells = tdMatches.map(td =>
              td.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim()
            );
            if (cells[0].includes('日期') || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue;
            const rawChange = (cells[3] || '').replace(/[%％]/g, '').trim();
            resolve({
              jzrq: cells[0],
              dwjz: cells[1],
              jzzzl: rawChange !== '' ? parseFloat(rawChange) : null
            });
            return;
          }
          resolve(null);
        } catch (e) {
          console.error('获取实际净值失败:', e);
          resolve(null);
        }
      },
      fail: () => resolve(null)
    });
  });
};

/**
 * 获取完整数据（包括估值和持仓），收盘后自动补充当日实际净值
 */
export const fetchFullFundData = async (code) => {
  try {
    const fundData = await fetchFundData(code);

    const now = new Date();
    const afterClose = now.getHours() > 15 || (now.getHours() === 15 && now.getMinutes() >= 30);
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // 15:30 后尝试获取当日实际净值，存到独立字段，不覆盖原始 dwjz/jzrq
    fundData.actualNav = null;
    fundData.actualNavDate = null;
    fundData.actualNavChange = null;

    if (afterClose) {
      const latest = await fetchLatestNav(code);
      if (latest && latest.jzrq === today) {
        fundData.actualNav = latest.dwjz;
        fundData.actualNavDate = latest.jzrq;

        // 优先用接口返回的涨跌幅
        if (latest.jzzzl != null && !isNaN(latest.jzzzl)) {
          fundData.actualNavChange = latest.jzzzl;
        } else {
          // 兜底：用前一日体重自行计算
          const prev = parseFloat(fundData.dwjz);
          const curr = parseFloat(latest.dwjz);
          if (prev > 0 && curr > 0) {
            fundData.actualNavChange = parseFloat(((curr - prev) / prev * 100).toFixed(2));
          }
        }
      }
    }

    const holdings = await fetchFundHoldings(code);
    const holdingsWithQuotes = await fetchStockQuotes(holdings);

    return {
      ...fundData,
      holdings: holdingsWithQuotes
    };
  } catch (error) {
    throw error;
  }
};

/**
 * 搜索基金
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 基金列表
 */
export const searchFunds = (keyword) => {
  return new Promise((resolve, reject) => {
    if (!keyword || !keyword.trim()) {
      resolve([]);
      return;
    }

    wx.request({
      url: `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx`,
      method: 'GET',
      data: {
        m: 1,
        key: keyword
      },
      dataType: 'text',
      responseType: 'text',
      success: (res) => {
        try {
          // 解析JSONP格式
          const jsonStr = res.data.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
          const data = JSON.parse(jsonStr);
          
          if (data && data.Datas) {
            const results = data.Datas
              .filter(item => item.CATEGORY === '700' || item.CATEGORYDESC === '基金')
              .map(item => ({
                code: item.CODE,
                name: item.NAME || item.SHORTNAME,
                type: item.FundBaseInfo?.ftype || '未知'
              }))
              .slice(0, 20);
            
            resolve(results);
          } else {
            resolve([]);
          }
        } catch (error) {
          console.error('解析搜索结果失败:', error);
          resolve([]);
        }
      },
      fail: (error) => {
        console.error('搜索基金失败:', error);
        reject(error);
      }
    });
  });
};

/**
 * 批量获取基金数据
 * @param {Array<string>} codes - 基金代码数组
 * @returns {Promise<Array>} 基金数据列表
 */
export const batchFetchFundData = async (codes) => {
  const results = [];
  
  for (const code of codes) {
    try {
      const data = await fetchFullFundData(code);
      results.push(data);
    } catch (error) {
      console.error(`获取基金${code}数据失败:`, error);
      results.push({
        code,
        name: `小鸡${code}`,
        error: true
      });
    }
  }
  
  return results;
};
