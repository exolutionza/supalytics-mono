import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  Sparkles,
  Zap,
  BarChart3,
  MessageSquare,
  Database,
  Wand2
} from "lucide-react";
import Footer from './footer';

const queryExamples = [
  { 
    text: "Analytics Query",
    command: "Show me user engagement trends for the last 30 days",
    color: "blue"
  },
  { 
    text: "Data Analysis",
    command: "Calculate revenue growth by product category",
    color: "blue"
  },
  { 
    text: "Insights",
    command: "Find patterns in customer behavior",
    color: "blue"
  }
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [animatedText, setAnimatedText] = useState('');
  const [showLoading, setShowLoading] = useState(true);

  const benefits = [
    { icon: Wand2, text: "AI-Powered Analysis" },
    { icon: Database, text: "Real-time Processing" },
    { icon: Sparkles, text: "Instant Results" }
  ];

  useEffect(() => {
    const currentQuery = queryExamples[currentStep].command;
    let currentIndex = 0;
    setShowLoading(true);
    
    const typingInterval = setInterval(() => {
      if (currentIndex <= currentQuery.length) {
        setAnimatedText(currentQuery.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setTimeout(() => {
          setShowLoading(false);
          setTimeout(() => {
            setCurrentStep((prev) => (prev + 1) % queryExamples.length);
          }, 4000);
        }, 1500);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, [currentStep]);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Header */}
      <header className="py-6 border-b border-gray-800">
        <nav className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img src="/icon.svg" alt="Logo" className="h-8 w-8" />
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              Supalytics
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-gray-800">
              Login
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700">Get Started</Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col lg:flex-row gap-12 items-center">
          {/* Left Column - Content */}
          <div className="flex-1 text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-blue-900/50 text-blue-400 px-3 py-1.5 rounded-full mb-6 text-sm border border-blue-800">
              <Zap className="w-4 h-4" />
              <span className="font-medium">Powered by AI</span>
            </div>
            
            {/* Headline */}
            <h1 className="text-4xl lg:text-6xl font-bold mb-6 tracking-tight">
              Transform Data into 
              <span className="block bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                Actionable Insights
              </span>
            </h1>
            
            {/* Description */}
            <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto lg:mx-0">
              Harness the power of AI to analyze your data. Ask questions in plain English and get instant, meaningful insights.
            </p>

            {/* Benefits */}
            <div className="flex flex-wrap gap-6 justify-center lg:justify-start mb-8">
              {benefits.map(({ icon: Icon, text }) => (
                <div 
                  key={text}
                  className="flex items-center gap-2 text-gray-400"
                >
                  <Icon className="w-5 h-5 text-blue-500" />
                  <span>{text}</span>
                </div>
              ))}
            </div>

            {/* Query Card */}
            <Card className="bg-gray-900 border-gray-800 mb-8">
              <CardContent className="p-4">
                <Badge variant="secondary" className="mb-2 bg-blue-900/50 text-blue-400 border border-blue-800">
                  {queryExamples[currentStep].text}
                </Badge>
                <div className="font-mono text-sm sm:text-base break-words">
                  <span className="text-blue-500">{'>'}</span>
                  <span className="text-gray-300">{animatedText}</span>
                  <span className="animate-pulse text-blue-500">|</span>
                </div>
              </CardContent>
            </Card>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => navigate('/signup')}
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
                onClick={() => navigate('/demo')}
              >
                Watch Demo
              </Button>
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="flex-1 w-full">
            <div className="relative max-w-md mx-auto">
              <Card className="bg-gray-900 border-gray-800 shadow-2xl shadow-blue-500/10 hover:scale-105 transition-transform duration-500">
                <CardContent className="p-0">
                  {/* Browser Controls */}
                  <div className="border-b border-gray-800 px-4 py-2 flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  </div>
                  
                  {/* Preview Content */}
                  <div className="relative bg-gray-900">
                    {/* Dashboard Preview */}
                    <div className={`transition-opacity duration-500 ${showLoading ? 'opacity-0' : 'opacity-100'}`}>
                      <div className="p-4">
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {['Users', 'Revenue', 'Growth', 'Engagement'].map((metric) => (
                            <div key={metric} className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                              <div className="text-xs text-gray-400 mb-1">{metric}</div>
                              <div className="text-lg font-semibold text-gray-100">
                                {Math.floor(Math.random() * 1000)}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                          <div className="h-32 bg-gradient-to-r from-blue-900/50 to-blue-800/30 rounded" />
                        </div>
                      </div>
                    </div>

                    {/* Loading Overlay */}
                    <div className={`absolute inset-0 bg-blue-600 flex items-center justify-center transition-opacity duration-500 ${
                      showLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}>
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                        <div className="text-base font-medium text-white">Processing query...</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notification Card */}
              <div className="relative">
                <Card className={`absolute -bottom-4 right-0 transition-all duration-500 w-36 bg-gray-900 border-gray-800 ${
                  showLoading ? 'opacity-0' : 'opacity-100'
                }`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-900/50 rounded-full flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-300">Analysis Ready</div>
                        <div className="text-xs text-gray-500">Just now</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-gradient-to-tr from-gray-900 to-black mt-24 border-t border-gray-800 p-8">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
            <div className="bg-gray-800/50 border-b border-gray-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                <span className="text-gray-300 font-medium">Natural Language Processing</span>
              </div>
            </div>
            <div className="p-6">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                  <Database className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1">
                  <div className="bg-gray-800 rounded-2xl p-4 inline-block max-w-md">
                    <p className="text-gray-300">
                      Show me the top performing products in Q4 2024...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="inline-block p-3 bg-blue-900/30 rounded-xl mb-6 border border-blue-800/50">
              <Sparkles className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Conversational Analytics
            </h2>
            <p className="text-xl text-gray-400 mb-8">
              Transform complex queries into simple conversations. Get the insights you need without writing a single line of code.
            </p>
            <ul className="space-y-4">
              {[
                'Natural language processing',
                'Smart query suggestions',
                'Real-time analysis',
                'Visual insights'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="p-1 bg-blue-900/30 rounded border border-blue-800/50">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-gray-400">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default LandingPage;